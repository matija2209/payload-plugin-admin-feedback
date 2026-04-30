'use client';

import React from 'react';

type CapturePolicy = 'current-tab-first' | 'strict-current-tab' | 'any-surface';

type SubmitPayload = {
  message: string;
  pagePath: string;
  selector?: string;
  selectedText?: string;
  screenshotId?: number | null;
  meta?: {
    userAgent?: string;
    locale?: string;
    viewport?: string;
  };
};

type SubmitResult = { success: true } | { success: false; error: string };
type UploadResult = { success: true; mediaId: number } | { success: false; error: string };

type FeedbackWidgetProps = {
  title?: string;
  submitLabel?: string;
  uploadLabel?: string;
  allowScreenshotUpload?: boolean;
  screenshotMaxFileSizeBytes?: number;
  screenshotAllowedMimeTypes?: string[];
  capturePolicy?: CapturePolicy;
  headerImageUrl?: string;
  onSubmit: (payload: SubmitPayload) => Promise<SubmitResult>;
  onUpload?: (formData: FormData) => Promise<UploadResult>;
};

type CaptureData = {
  selector: string;
  selectedText: string;
};

type AnnotationPoint = {
  x: number;
  y: number;
};

type AnnotationStyle = {
  color: string;
  size: number;
};

type PenOperation = {
  id: string;
  type: 'pen';
  style: AnnotationStyle;
  points: AnnotationPoint[];
};

type RectangleOperation = {
  id: string;
  type: 'rectangle';
  style: AnnotationStyle;
  start: AnnotationPoint;
  end: AnnotationPoint;
};

type ArrowOperation = {
  id: string;
  type: 'arrow';
  style: AnnotationStyle;
  start: AnnotationPoint;
  end: AnnotationPoint;
};

type TextOperation = {
  id: string;
  type: 'text';
  style: AnnotationStyle;
  point: AnnotationPoint;
  text: string;
};

type AnnotationOperation = PenOperation | RectangleOperation | ArrowOperation | TextOperation;
type DrawableDraftOperation = PenOperation | RectangleOperation | ArrowOperation;
type AnnotationTool = AnnotationOperation['type'];

type EditorImage = {
  element: HTMLImageElement;
  fileName: string;
  height: number;
  src: string;
  width: number;
};

type EditorHistory = {
  operations: AnnotationOperation[];
  redoStack: AnnotationOperation[][];
  undoStack: AnnotationOperation[][];
};

type ExtendedDisplayMediaStreamOptions = DisplayMediaStreamOptions & {
  preferCurrentTab?: boolean;
  selfBrowserSurface?: 'include' | 'exclude';
  surfaceSwitching?: 'include' | 'exclude';
};

type ExtendedMediaTrackSettings = MediaTrackSettings & {
  displaySurface?: string;
};

const DEFAULT_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7'];
const DEFAULT_HISTORY: EditorHistory = {
  operations: [],
  redoStack: [],
  undoStack: [],
};

const createOperationId = (): string =>
  `annotation-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const getCssSelector = (element: Element): string => {
  if (element.id) {
    return `#${element.id}`;
  }

  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
    let part = current.tagName.toLowerCase();
    const className = current.className;
    if (typeof className === 'string') {
      const firstClass = className
        .split(' ')
        .map((value) => value.trim())
        .filter(Boolean)[0];
      if (firstClass) {
        part += `.${firstClass}`;
      }
    }

    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (candidate) => candidate.tagName === current?.tagName,
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current);
        part += `:nth-of-type(${index + 1})`;
      }
    }

    parts.unshift(part);
    current = current.parentElement;
  }

  return parts.join(' > ');
};

const fileToDataUrl = async (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(new Error('Unsupported image format.'));
    };
    reader.onerror = () => reject(new Error('Could not read image.'));
    reader.readAsDataURL(file);
  });

const loadImage = async (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load image.'));
    image.src = src;
  });

const createEditorImage = async (file: File): Promise<EditorImage> => {
  const src = await fileToDataUrl(file);
  const element = await loadImage(src);

  return {
    element,
    fileName: file.name,
    height: element.naturalHeight || element.height,
    src,
    width: element.naturalWidth || element.width,
  };
};

const canvasToFile = async (
  canvas: HTMLCanvasElement,
  fileName = `feedback-${Date.now()}.png`,
): Promise<File> => {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((nextBlob) => resolve(nextBlob), 'image/png');
  });

  if (!blob) {
    throw new Error('Failed to prepare annotated screenshot.');
  }

  return new File([blob], fileName.replace(/\.[a-z0-9]+$/i, '') + '.png', { type: 'image/png' });
};

const waitForRenderedVideoFrame = async (video: HTMLVideoElement): Promise<void> => {
  if ('requestVideoFrameCallback' in video) {
    await new Promise<void>((resolve) => {
      (
        video as HTMLVideoElement & {
          requestVideoFrameCallback: (callback: () => void) => number;
        }
      ).requestVideoFrameCallback(() => resolve());
    });
    return;
  }

  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
};

const captureScreenshotFile = async (
  capturePolicy: CapturePolicy,
): Promise<{ file: File; surface: string | null }> => {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('Browser does not support screen capture.');
  }

  const options: ExtendedDisplayMediaStreamOptions =
    capturePolicy === 'any-surface'
      ? {
          video: true,
          audio: false,
        }
      : {
          video: {
            displaySurface: 'browser' as const,
          },
          audio: false,
          preferCurrentTab: true,
          selfBrowserSurface: 'include',
          surfaceSwitching: 'exclude',
        };

  const stream = await navigator.mediaDevices.getDisplayMedia(options);
  const track = stream.getVideoTracks()[0];
  if (!track) {
    stream.getTracks().forEach((item) => item.stop());
    throw new Error('Screen capture failed.');
  }

  const settings = track.getSettings() as ExtendedMediaTrackSettings;
  const surface = typeof settings.displaySurface === 'string' ? settings.displaySurface : null;

  if (capturePolicy === 'strict-current-tab' && surface !== 'browser') {
    stream.getTracks().forEach((item) => item.stop());
    throw new Error('Please share the current browser tab to capture a screenshot.');
  }

  const video = document.createElement('video');

  try {
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    await waitForRenderedVideoFrame(video);

    const width = video.videoWidth || window.innerWidth;
    const height = video.videoHeight || window.innerHeight;
    if (!width || !height) {
      throw new Error('Screen capture failed.');
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Browser does not support canvas context.');
    }

    context.drawImage(video, 0, 0, width, height);

    return {
      file: await canvasToFile(canvas),
      surface,
    };
  } finally {
    video.pause();
    video.srcObject = null;
    stream.getTracks().forEach((item) => item.stop());
  }
};

const getCanvasPoint = (
  event: React.PointerEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement,
): AnnotationPoint => {
  const bounds = canvas.getBoundingClientRect();
  const scaleX = bounds.width === 0 ? 1 : canvas.width / bounds.width;
  const scaleY = bounds.height === 0 ? 1 : canvas.height / bounds.height;

  return {
    x: (event.clientX - bounds.left) * scaleX,
    y: (event.clientY - bounds.top) * scaleY,
  };
};

const drawPenOperation = (
  context: CanvasRenderingContext2D,
  operation: PenOperation,
): void => {
  if (operation.points.length === 0) {
    return;
  }

  context.save();
  context.strokeStyle = operation.style.color;
  context.lineWidth = operation.style.size;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  context.moveTo(operation.points[0].x, operation.points[0].y);

  for (const point of operation.points.slice(1)) {
    context.lineTo(point.x, point.y);
  }

  if (operation.points.length === 1) {
    const point = operation.points[0];
    context.lineTo(point.x + 0.01, point.y + 0.01);
  }

  context.stroke();
  context.restore();
};

const drawRectangleOperation = (
  context: CanvasRenderingContext2D,
  operation: RectangleOperation,
): void => {
  const left = Math.min(operation.start.x, operation.end.x);
  const top = Math.min(operation.start.y, operation.end.y);
  const width = Math.abs(operation.end.x - operation.start.x);
  const height = Math.abs(operation.end.y - operation.start.y);

  context.save();
  context.strokeStyle = operation.style.color;
  context.lineWidth = operation.style.size;
  context.strokeRect(left, top, width, height);
  context.restore();
};

const drawArrowOperation = (
  context: CanvasRenderingContext2D,
  operation: ArrowOperation,
): void => {
  const angle = Math.atan2(operation.end.y - operation.start.y, operation.end.x - operation.start.x);
  const headLength = Math.max(14, operation.style.size * 4);

  context.save();
  context.strokeStyle = operation.style.color;
  context.fillStyle = operation.style.color;
  context.lineWidth = operation.style.size;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  context.moveTo(operation.start.x, operation.start.y);
  context.lineTo(operation.end.x, operation.end.y);
  context.stroke();

  context.beginPath();
  context.moveTo(operation.end.x, operation.end.y);
  context.lineTo(
    operation.end.x - headLength * Math.cos(angle - Math.PI / 6),
    operation.end.y - headLength * Math.sin(angle - Math.PI / 6),
  );
  context.lineTo(
    operation.end.x - headLength * Math.cos(angle + Math.PI / 6),
    operation.end.y - headLength * Math.sin(angle + Math.PI / 6),
  );
  context.closePath();
  context.fill();
  context.restore();
};

const drawTextOperation = (
  context: CanvasRenderingContext2D,
  operation: TextOperation,
): void => {
  const fontSize = Math.max(16, operation.style.size * 6);

  context.save();
  context.fillStyle = operation.style.color;
  context.font = `600 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
  context.textBaseline = 'top';
  context.fillText(operation.text, operation.point.x, operation.point.y);
  context.restore();
};

const drawOperation = (
  context: CanvasRenderingContext2D,
  operation: AnnotationOperation,
): void => {
  switch (operation.type) {
    case 'pen':
      drawPenOperation(context, operation);
      return;
    case 'rectangle':
      drawRectangleOperation(context, operation);
      return;
    case 'arrow':
      drawArrowOperation(context, operation);
      return;
    case 'text':
      drawTextOperation(context, operation);
      return;
  }
};

const isShapeMeaningful = (start: AnnotationPoint, end: AnnotationPoint): boolean =>
  Math.abs(end.x - start.x) > 3 || Math.abs(end.y - start.y) > 3;

export function FeedbackWidget({
  title = 'Admin feedback',
  submitLabel = 'Send',
  uploadLabel = 'Upload image',
  allowScreenshotUpload = true,
  screenshotMaxFileSizeBytes = 5 * 1024 * 1024,
  screenshotAllowedMimeTypes = ['image/png', 'image/jpeg', 'image/webp'],
  capturePolicy = 'current-tab-first',
  headerImageUrl,
  onSubmit,
  onUpload,
}: FeedbackWidgetProps) {
  const [open, setOpen] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [captureMode, setCaptureMode] = React.useState(false);
  const [captureData, setCaptureData] = React.useState<CaptureData | null>(null);
  const [screenshotId, setScreenshotId] = React.useState<number | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [currentPath, setCurrentPath] = React.useState('/');
  const [annotating, setAnnotating] = React.useState(false);
  const [editorImage, setEditorImage] = React.useState<EditorImage | null>(null);
  const [editorHistory, setEditorHistory] = React.useState<EditorHistory>(DEFAULT_HISTORY);
  const [draftOperation, setDraftOperation] = React.useState<DrawableDraftOperation | null>(null);
  const [annotationTool, setAnnotationTool] = React.useState<AnnotationTool>('pen');
  const [annotationColor, setAnnotationColor] = React.useState(DEFAULT_COLORS[0]);
  const [annotationSize, setAnnotationSize] = React.useState(4);
  const [annotationText, setAnnotationText] = React.useState('');
  const hoverTargetRef = React.useRef<Element | null>(null);
  const annotationCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const pointerIdRef = React.useRef<number | null>(null);
  const draftOperationRef = React.useRef<DrawableDraftOperation | null>(null);

  React.useEffect(() => {
    draftOperationRef.current = draftOperation;
  }, [draftOperation]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const updatePath = (): void => {
      setCurrentPath(window.location.pathname);
    };

    updatePath();

    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    window.history.pushState = function (...args) {
      originalPushState.apply(this, args);
      updatePath();
    };

    window.history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      updatePath();
    };

    window.addEventListener('popstate', updatePath);
    window.addEventListener('hashchange', updatePath);

    return () => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      window.removeEventListener('popstate', updatePath);
      window.removeEventListener('hashchange', updatePath);
    };
  }, []);

  React.useEffect(() => {
    if (!captureMode) {
      return;
    }

    const clearOutline = (): void => {
      if (hoverTargetRef.current instanceof HTMLElement) {
        hoverTargetRef.current.style.outline = '';
      }
      hoverTargetRef.current = null;
    };

    const onMouseMove = (event: MouseEvent): void => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (hoverTargetRef.current !== target) {
        clearOutline();
        target.style.outline = '2px dashed #22c55e';
        hoverTargetRef.current = target;
      }
    };

    const onClick = (event: MouseEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      setCaptureData({
        selector: getCssSelector(target),
        selectedText: target.textContent?.trim().slice(0, 200) || '',
      });
      clearOutline();
      setCaptureMode(false);
    };

    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onClick, true);

    return () => {
      clearOutline();
      document.removeEventListener('mousemove', onMouseMove, true);
      document.removeEventListener('click', onClick, true);
    };
  }, [captureMode]);

  React.useEffect(() => {
    if (!open || !allowScreenshotUpload) {
      return;
    }

    const onPaste = async (event: ClipboardEvent): Promise<void> => {
      const file = Array.from(event.clipboardData?.items || [])
        .find((item) => item.type.startsWith('image/'))
        ?.getAsFile();

      if (!file) {
        return;
      }

      event.preventDefault();
      await handleStartAnnotation(file);
    };

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [open, allowScreenshotUpload]);

  React.useEffect(() => {
    if (!annotating) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [annotating]);

  React.useEffect(() => {
    if (!annotating || !editorImage || !annotationCanvasRef.current) {
      return;
    }

    const canvas = annotationCanvasRef.current;
    canvas.width = editorImage.width;
    canvas.height = editorImage.height;

    const context = canvas.getContext('2d');
    if (!context) {
      setError('Browser does not support canvas context.');
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(editorImage.element, 0, 0, canvas.width, canvas.height);

    for (const operation of editorHistory.operations) {
      drawOperation(context, operation);
    }

    if (draftOperation) {
      drawOperation(context, draftOperation);
    }
  }, [annotating, draftOperation, editorHistory.operations, editorImage]);

  const validateImageFile = React.useCallback(
    (file: File): string | null => {
      if (!screenshotAllowedMimeTypes.includes(file.type)) {
        return `Supported image types: ${screenshotAllowedMimeTypes.join(', ')}`;
      }

      if (file.size > screenshotMaxFileSizeBytes) {
        return `Image is too large. Maximum size: ${Math.round(screenshotMaxFileSizeBytes / 1024 / 1024)}MB.`;
      }

      return null;
    },
    [screenshotAllowedMimeTypes, screenshotMaxFileSizeBytes],
  );

  const uploadImageFile = React.useCallback(
    async (file: File): Promise<void> => {
      if (!onUpload) {
        return;
      }

      setError(null);
      setUploading(true);

      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('alt', file.name);
        const result = await onUpload(formData);

        if (result.success) {
          setScreenshotId(result.mediaId);
          setNotice('Annotated screenshot uploaded.');
          return;
        }

        setError(result.error);
      } finally {
        setUploading(false);
      }
    },
    [onUpload],
  );

  const closeAnnotationEditor = React.useCallback((): void => {
    setAnnotating(false);
    setEditorImage(null);
    setEditorHistory(DEFAULT_HISTORY);
    setDraftOperation(null);
    draftOperationRef.current = null;
  }, []);

  const handleStartAnnotation = React.useCallback(
    async (file: File): Promise<void> => {
      const validationError = validateImageFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }

      try {
        const nextImage = await createEditorImage(file);
        setEditorImage(nextImage);
        setEditorHistory(DEFAULT_HISTORY);
        setDraftOperation(null);
        draftOperationRef.current = null;
        setAnnotating(true);
        setError(null);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Failed to process image.');
      }
    },
    [validateImageFile],
  );

  const commitOperations = React.useCallback((nextOperations: AnnotationOperation[]): void => {
    setEditorHistory((current) => ({
      operations: nextOperations,
      redoStack: [],
      undoStack: [...current.undoStack, current.operations],
    }));
  }, []);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (file) {
      await handleStartAnnotation(file);
    }
    event.target.value = '';
  };

  const handleCaptureScreenshot = async (): Promise<void> => {
    try {
      setError(null);
      const { file, surface } = await captureScreenshotFile(capturePolicy);
      if (capturePolicy === 'current-tab-first') {
        if (surface === 'browser') {
          setNotice('Captured the current tab.');
        } else if (surface) {
          setNotice(`Captured a ${surface} surface because the browser allowed a broader selection.`);
        } else {
          setNotice('Captured a screenshot.');
        }
      } else if (capturePolicy === 'strict-current-tab') {
        setNotice('Captured the current tab.');
      } else {
        setNotice('Captured a screenshot.');
      }

      await handleStartAnnotation(file);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Screen capture failed.');
    }
  };

  const handleUndo = (): void => {
    setEditorHistory((current) => {
      if (current.undoStack.length === 0) {
        return current;
      }

      const previousOperations = current.undoStack[current.undoStack.length - 1];
      return {
        operations: previousOperations,
        redoStack: [current.operations, ...current.redoStack],
        undoStack: current.undoStack.slice(0, -1),
      };
    });
  };

  const handleRedo = (): void => {
    setEditorHistory((current) => {
      if (current.redoStack.length === 0) {
        return current;
      }

      const [nextOperations, ...remainingRedo] = current.redoStack;
      return {
        operations: nextOperations,
        redoStack: remainingRedo,
        undoStack: [...current.undoStack, current.operations],
      };
    });
  };

  const handleClearAnnotations = (): void => {
    if (editorHistory.operations.length === 0) {
      return;
    }

    commitOperations([]);
  };

  const handleRevertToOriginal = (): void => {
    setEditorHistory(DEFAULT_HISTORY);
    setDraftOperation(null);
    draftOperationRef.current = null;
  };

  const handleCanvasPointerDown = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!annotationCanvasRef.current) {
      return;
    }

    setError(null);

    const canvas = annotationCanvasRef.current;
    const point = getCanvasPoint(event, canvas);

    if (annotationTool === 'text') {
      const text = annotationText.trim();
      if (!text) {
        setError('Enter text before placing it on the image.');
        return;
      }

      const operation: TextOperation = {
        id: createOperationId(),
        type: 'text',
        style: { color: annotationColor, size: annotationSize },
        point,
        text,
      };
      commitOperations([...editorHistory.operations, operation]);
      return;
    }

    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    pointerIdRef.current = event.pointerId;

    const style = { color: annotationColor, size: annotationSize };
    const nextDraft: DrawableDraftOperation =
      annotationTool === 'pen'
        ? {
            id: createOperationId(),
            type: 'pen',
            style,
            points: [point],
          }
        : annotationTool === 'rectangle'
          ? {
              id: createOperationId(),
              type: 'rectangle',
              style,
              start: point,
              end: point,
            }
          : {
              id: createOperationId(),
              type: 'arrow',
              style,
              start: point,
              end: point,
            };

    draftOperationRef.current = nextDraft;
    setDraftOperation(nextDraft);
  };

  const handleCanvasPointerMove = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!annotationCanvasRef.current || pointerIdRef.current !== event.pointerId) {
      return;
    }

    const activeDraft = draftOperationRef.current;
    if (!activeDraft) {
      return;
    }

    const point = getCanvasPoint(event, annotationCanvasRef.current);
    const nextDraft: DrawableDraftOperation =
      activeDraft.type === 'pen'
        ? {
            ...activeDraft,
            points: [...activeDraft.points, point],
          }
        : {
            ...activeDraft,
            end: point,
          };

    draftOperationRef.current = nextDraft;
    setDraftOperation(nextDraft);
  };

  const handleCanvasPointerUp = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!annotationCanvasRef.current || pointerIdRef.current !== event.pointerId) {
      return;
    }

    const canvas = annotationCanvasRef.current;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }

    pointerIdRef.current = null;
    const activeDraft = draftOperationRef.current;
    draftOperationRef.current = null;
    setDraftOperation(null);

    if (!activeDraft) {
      return;
    }

    if (activeDraft.type === 'pen') {
      const points =
        activeDraft.points.length === 1
          ? [...activeDraft.points, activeDraft.points[0]]
          : activeDraft.points;
      commitOperations([...editorHistory.operations, { ...activeDraft, points }]);
      return;
    }

    if (!isShapeMeaningful(activeDraft.start, activeDraft.end)) {
      return;
    }

    commitOperations([...editorHistory.operations, activeDraft]);
  };

  const handleCanvasPointerCancel = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (
      annotationCanvasRef.current &&
      pointerIdRef.current === event.pointerId &&
      annotationCanvasRef.current.hasPointerCapture(event.pointerId)
    ) {
      annotationCanvasRef.current.releasePointerCapture(event.pointerId);
    }

    pointerIdRef.current = null;
    draftOperationRef.current = null;
    setDraftOperation(null);
  };

  const handleApplyAnnotation = async (): Promise<void> => {
    if (!annotationCanvasRef.current || !editorImage) {
      return;
    }

    try {
      const file = await canvasToFile(annotationCanvasRef.current, editorImage.fileName);
      await uploadImageFile(file);
      closeAnnotationEditor();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to export image.');
    }
  };

  const handleSubmit = async (): Promise<void> => {
    if (!message.trim()) {
      setError('Please enter a message.');
      return;
    }

    setSubmitting(true);
    setError(null);
    const result = await onSubmit({
      message: message.trim(),
      pagePath: currentPath,
      selector: captureData?.selector,
      selectedText: captureData?.selectedText,
      screenshotId,
      meta: {
        userAgent: window.navigator.userAgent,
        locale: window.navigator.language,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
      },
    });
    setSubmitting(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    setMessage('');
    setCaptureData(null);
    setScreenshotId(null);
    setNotice(null);
    setOpen(false);
  };

  const currentHasUndo = editorHistory.undoStack.length > 0;
  const currentHasRedo = editorHistory.redoStack.length > 0;
  const hasAnnotations = editorHistory.operations.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        style={{
          position: 'fixed',
          right: '20px',
          bottom: '20px',
          zIndex: 9999,
          borderRadius: '999px',
          backgroundColor: '#166534',
          color: '#ffffff',
          border: 'none',
          padding: '10px 14px',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Feedback
      </button>
      {open ? (
        <div
          style={{
            position: 'fixed',
            right: '20px',
            bottom: '72px',
            width: '360px',
            background: '#111827',
            color: '#f9fafb',
            borderRadius: '12px',
            border: '1px solid #374151',
            padding: '12px',
            zIndex: 9999,
            boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
          }}
        >
          {headerImageUrl ? (
            <div style={{ marginBottom: '12px', borderRadius: '8px', overflow: 'hidden' }}>
              <img
                src={headerImageUrl}
                alt="Header"
                style={{ width: '100%', height: 'auto', display: 'block' }}
              />
            </div>
          ) : null}
          <h3 style={{ margin: '0 0 8px', fontSize: '16px' }}>{title}</h3>
          <p style={{ margin: '0 0 8px', fontSize: '12px', opacity: 0.8 }}>{currentPath}</p>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={5}
            placeholder="Describe the issue..."
            style={{
              width: '100%',
              borderRadius: '8px',
              border: '1px solid #4b5563',
              background: '#1f2937',
              color: '#f9fafb',
              padding: '8px',
              resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
            {allowScreenshotUpload && onUpload ? (
              <button
                type="button"
                onClick={handleCaptureScreenshot}
                style={{
                  borderRadius: '8px',
                  border: '1px solid #4b5563',
                  background: '#1f2937',
                  color: '#f9fafb',
                  padding: '6px 8px',
                  cursor: 'pointer',
                }}
              >
                Capture screen
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setCaptureMode((value) => !value)}
              style={{
                borderRadius: '8px',
                border: '1px solid #4b5563',
                background: captureMode ? '#14532d' : '#1f2937',
                color: '#f9fafb',
                padding: '6px 8px',
                cursor: 'pointer',
              }}
            >
              {captureMode ? 'Click an element...' : 'Capture element'}
            </button>
            {allowScreenshotUpload && onUpload ? (
              <label
                style={{
                  borderRadius: '8px',
                  border: '1px solid #4b5563',
                  background: '#1f2937',
                  color: '#f9fafb',
                  padding: '6px 8px',
                  cursor: 'pointer',
                }}
              >
                {uploading ? 'Uploading...' : uploadLabel}
                <input
                  type="file"
                  accept={screenshotAllowedMimeTypes.join(',')}
                  onChange={handleUpload}
                  hidden
                />
              </label>
            ) : null}
          </div>
          {allowScreenshotUpload && onUpload ? (
            <p style={{ margin: '8px 0 0', fontSize: '11px', opacity: 0.8 }}>
              Paste an image with Ctrl/Cmd+V or capture the current tab first.
            </p>
          ) : null}
          {captureData ? (
            <p style={{ margin: '8px 0 0', fontSize: '12px', opacity: 0.8 }}>
              Selector: {captureData.selector}
            </p>
          ) : null}
          {screenshotId ? (
            <p style={{ margin: '4px 0 0', fontSize: '12px', opacity: 0.8 }}>
              Media ID: {screenshotId}
            </p>
          ) : null}
          {notice ? (
            <p style={{ margin: '8px 0 0', color: '#bfdbfe', fontSize: '12px' }}>{notice}</p>
          ) : null}
          {error ? (
            <p style={{ margin: '8px 0 0', color: '#fca5a5', fontSize: '12px' }}>{error}</p>
          ) : null}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                borderRadius: '8px',
                border: '1px solid #4b5563',
                background: '#1f2937',
                color: '#f9fafb',
                padding: '6px 10px',
                cursor: 'pointer',
              }}
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              style={{
                borderRadius: '8px',
                border: 'none',
                background: '#16a34a',
                color: '#f9fafb',
                padding: '6px 10px',
                cursor: 'pointer',
              }}
            >
              {submitting ? 'Sending...' : submitLabel}
            </button>
          </div>
        </div>
      ) : null}
      {annotating && editorImage ? (
        <div
          style={{
            position: 'fixed',
            inset: '0',
            zIndex: 10000,
            background: 'rgba(3, 7, 18, 0.94)',
            color: '#f9fafb',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderBottom: '1px solid rgba(148, 163, 184, 0.2)',
              background: 'rgba(15, 23, 42, 0.92)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '15px' }}>Annotate screenshot</strong>
              <span style={{ fontSize: '12px', opacity: 0.75 }}>{editorImage.fileName}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
              <select
                value={annotationTool}
                onChange={(event) => setAnnotationTool(event.target.value as AnnotationTool)}
                aria-label="Annotation tool"
                style={{
                  borderRadius: '8px',
                  border: '1px solid #475569',
                  background: '#0f172a',
                  color: '#f8fafc',
                  padding: '6px 8px',
                }}
              >
                <option value="pen">Pen</option>
                <option value="rectangle">Rectangle</option>
                <option value="arrow">Arrow</option>
                <option value="text">Text</option>
              </select>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                {DEFAULT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setAnnotationColor(color)}
                    aria-label={`Select ${color} color`}
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '999px',
                      border: annotationColor === color ? '2px solid #f8fafc' : '1px solid #334155',
                      background: color,
                      cursor: 'pointer',
                    }}
                  />
                ))}
                <input
                  type="color"
                  value={annotationColor}
                  onChange={(event) => setAnnotationColor(event.target.value)}
                  aria-label="Annotation color"
                  style={{ width: '34px', height: '34px', border: 'none', background: 'transparent' }}
                />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                Size
                <input
                  type="range"
                  min={1}
                  max={18}
                  value={annotationSize}
                  onChange={(event) => setAnnotationSize(Number(event.target.value))}
                  aria-label="Annotation size"
                />
              </label>
              {annotationTool === 'text' ? (
                <input
                  type="text"
                  value={annotationText}
                  onChange={(event) => setAnnotationText(event.target.value)}
                  placeholder="Text to place"
                  aria-label="Annotation text"
                  style={{
                    minWidth: '160px',
                    borderRadius: '8px',
                    border: '1px solid #475569',
                    background: '#0f172a',
                    color: '#f8fafc',
                    padding: '6px 8px',
                  }}
                />
              ) : null}
              <button
                type="button"
                onClick={handleUndo}
                disabled={!currentHasUndo}
                style={{
                  borderRadius: '8px',
                  border: '1px solid #475569',
                  background: '#0f172a',
                  color: '#f8fafc',
                  padding: '6px 10px',
                  cursor: currentHasUndo ? 'pointer' : 'not-allowed',
                  opacity: currentHasUndo ? 1 : 0.5,
                }}
              >
                Undo
              </button>
              <button
                type="button"
                onClick={handleRedo}
                disabled={!currentHasRedo}
                style={{
                  borderRadius: '8px',
                  border: '1px solid #475569',
                  background: '#0f172a',
                  color: '#f8fafc',
                  padding: '6px 10px',
                  cursor: currentHasRedo ? 'pointer' : 'not-allowed',
                  opacity: currentHasRedo ? 1 : 0.5,
                }}
              >
                Redo
              </button>
              <button
                type="button"
                onClick={handleClearAnnotations}
                disabled={!hasAnnotations}
                style={{
                  borderRadius: '8px',
                  border: '1px solid #475569',
                  background: '#0f172a',
                  color: '#f8fafc',
                  padding: '6px 10px',
                  cursor: hasAnnotations ? 'pointer' : 'not-allowed',
                  opacity: hasAnnotations ? 1 : 0.5,
                }}
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handleRevertToOriginal}
                disabled={!hasAnnotations && !currentHasUndo && !currentHasRedo}
                style={{
                  borderRadius: '8px',
                  border: '1px solid #475569',
                  background: '#0f172a',
                  color: '#f8fafc',
                  padding: '6px 10px',
                  cursor:
                    hasAnnotations || currentHasUndo || currentHasRedo ? 'pointer' : 'not-allowed',
                  opacity: hasAnnotations || currentHasUndo || currentHasRedo ? 1 : 0.5,
                }}
              >
                Revert
              </button>
            </div>
          </div>
          <div
            style={{
              flex: 1,
              overflow: 'auto',
              padding: '16px',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'center',
            }}
          >
            <canvas
              ref={annotationCanvasRef}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              onPointerCancel={handleCanvasPointerCancel}
              style={{
                width: 'min(100%, 1400px)',
                height: 'auto',
                display: 'block',
                borderRadius: '16px',
                background: '#ffffff',
                boxShadow: '0 24px 80px rgba(15, 23, 42, 0.45)',
                touchAction: 'none',
                cursor: annotationTool === 'text' ? 'copy' : 'crosshair',
              }}
            />
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap',
              padding: '12px 16px',
              borderTop: '1px solid rgba(148, 163, 184, 0.2)',
              background: 'rgba(15, 23, 42, 0.92)',
            }}
          >
            <p style={{ margin: 0, fontSize: '12px', opacity: 0.75 }}>
              Use mouse, touch, or pen input. Text is placed where you click on the image.
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={closeAnnotationEditor}
                style={{
                  borderRadius: '8px',
                  border: '1px solid #475569',
                  background: '#0f172a',
                  color: '#f8fafc',
                  padding: '8px 12px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyAnnotation}
                disabled={uploading}
                style={{
                  borderRadius: '8px',
                  border: 'none',
                  background: '#16a34a',
                  color: '#f8fafc',
                  padding: '8px 12px',
                  cursor: uploading ? 'wait' : 'pointer',
                  opacity: uploading ? 0.8 : 1,
                }}
              >
                {uploading ? 'Uploading...' : 'Save screenshot'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
