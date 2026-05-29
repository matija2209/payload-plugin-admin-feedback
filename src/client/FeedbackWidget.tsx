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
type DeleteResult = { success: true } | { success: false; error: string };

type FeedbackWidgetProps = {
  title?: string;
  submitLabel?: string;
  uploadLabel?: string;
  allowScreenshotUpload?: boolean;
  screenshotMaxFileSizeBytes?: number;
  screenshotAllowedMimeTypes?: string[];
  capturePolicy?: CapturePolicy;
  onSubmit: (payload: SubmitPayload) => Promise<SubmitResult>;
  onUpload?: (formData: FormData) => Promise<UploadResult>;
  onDeleteScreenshot?: (mediaId: number) => Promise<DeleteResult>;
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

type TextCursor = {
  domX: number;
  domY: number;
  canvasPoint: AnnotationPoint;
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

// ─── Icons ────────────────────────────────────────────────────────────────────

function ChatIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function XIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function CursorIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4l7.07 17 2.51-7.39L21 11.07z" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function PenIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19l7-7 3 3-7 7-3-3z" />
      <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
      <path d="M2 2l7.586 7.586" />
      <circle cx="11" cy="11" r="2" />
    </svg>
  );
}

function RectIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="19" x2="19" y2="5" />
      <polyline points="13 5 19 5 19 11" />
    </svg>
  );
}

function TextIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 14 4 9 9 4" />
      <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 14 20 9 15 4" />
      <path d="M4 20v-7a4 4 0 0 1 4-4h12" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FeedbackWidget({
  title = 'Admin feedback',
  submitLabel = 'Send',
  uploadLabel = 'Upload image',
  allowScreenshotUpload = true,
  screenshotMaxFileSizeBytes = 5 * 1024 * 1024,
  screenshotAllowedMimeTypes = ['image/png', 'image/jpeg', 'image/webp'],
  capturePolicy = 'current-tab-first',
  onSubmit,
  onUpload,
  onDeleteScreenshot,
}: FeedbackWidgetProps) {
  const [open, setOpen] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [captureMode, setCaptureMode] = React.useState(false);
  const [captureData, setCaptureData] = React.useState<CaptureData | null>(null);
  const [screenshotId, setScreenshotId] = React.useState<number | null>(null);
  const [screenshotPreviewUrl, setScreenshotPreviewUrl] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [deletingScreenshot, setDeletingScreenshot] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [currentPath, setCurrentPath] = React.useState('');
  const [capturingScreen, setCapturingScreen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [annotating, setAnnotating] = React.useState(false);
  const [editorImage, setEditorImage] = React.useState<EditorImage | null>(null);
  const [editorHistory, setEditorHistory] = React.useState<EditorHistory>(DEFAULT_HISTORY);
  const [draftOperation, setDraftOperation] = React.useState<DrawableDraftOperation | null>(null);
  const [annotationTool, setAnnotationTool] = React.useState<AnnotationTool>('pen');
  const [annotationColor, setAnnotationColor] = React.useState(DEFAULT_COLORS[0]);
  const [annotationSize, setAnnotationSize] = React.useState(4);
  const [textCursor, setTextCursor] = React.useState<TextCursor | null>(null);
  const [inlineText, setInlineText] = React.useState('');
  const hoverTargetRef = React.useRef<Element | null>(null);
  const annotationCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const annotationScrollRef = React.useRef<HTMLDivElement | null>(null);
  const textInputRef = React.useRef<HTMLInputElement | null>(null);
  const pointerIdRef = React.useRef<number | null>(null);
  const draftOperationRef = React.useRef<DrawableDraftOperation | null>(null);
  // Refs keep commitTextInput free of stale-closure issues
  const inlineTextRef = React.useRef('');
  const textCursorRef = React.useRef<TextCursor | null>(null);
  const annotationColorRef = React.useRef(DEFAULT_COLORS[0]);
  const annotationSizeRef = React.useRef(4);

  React.useEffect(() => {
    draftOperationRef.current = draftOperation;
  }, [draftOperation]);

  React.useEffect(() => { inlineTextRef.current = inlineText; }, [inlineText]);
  React.useEffect(() => { textCursorRef.current = textCursor; }, [textCursor]);
  React.useEffect(() => { annotationColorRef.current = annotationColor; }, [annotationColor]);
  React.useEffect(() => { annotationSizeRef.current = annotationSize; }, [annotationSize]);

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

  React.useEffect(() => {
    setCurrentPath(window.location.pathname);
  }, []);

  // Auto-close success panel after 2.5 s
  React.useEffect(() => {
    if (!submitted) return;
    const timer = setTimeout(() => {
      setOpen(false);
      setSubmitted(false);
    }, 2500);
    return () => clearTimeout(timer);
  }, [submitted]);

  // (autoFocus on the input handles focus; no manual focus effect needed)

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
    async (file: File): Promise<boolean> => {
      if (!onUpload) {
        return false;
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
          return true;
        }

        setError(result.error);
        return false;
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
    setTextCursor(null);
    setInlineText('');
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
        setTextCursor(null);
        setInlineText('');
        draftOperationRef.current = null;
        setAnnotating(true);
        setError(null);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Failed to process image.');
      }
    },
    [validateImageFile],
  );

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
  }, [allowScreenshotUpload, handleStartAnnotation, open]);

  const commitOperations = React.useCallback((nextOperations: AnnotationOperation[]): void => {
    setEditorHistory((current) => ({
      operations: nextOperations,
      redoStack: [],
      undoStack: [...current.undoStack, current.operations],
    }));
  }, []);

  const appendOperation = React.useCallback((operation: AnnotationOperation): void => {
    setEditorHistory((current) => ({
      operations: [...current.operations, operation],
      redoStack: [],
      undoStack: [...current.undoStack, current.operations],
    }));
  }, []);

  const commitTextInput = React.useCallback((): void => {
    const text = inlineTextRef.current.trim();
    const cursor = textCursorRef.current;
    if (text && cursor) {
      const operation: TextOperation = {
        id: createOperationId(),
        type: 'text',
        style: { color: annotationColorRef.current, size: annotationSizeRef.current },
        point: cursor.canvasPoint,
        text,
      };
      appendOperation(operation);
    }
    textCursorRef.current = null;
    setTextCursor(null);
    setInlineText('');
  }, [appendOperation]);

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
      setCapturingScreen(true);
      await new Promise((resolve) => setTimeout(resolve, 120));
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
    } finally {
      setCapturingScreen(false);
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

  const handleRevertLastAnnotation = (): void => {
    setDraftOperation(null);
    draftOperationRef.current = null;
    pointerIdRef.current = null;

    setEditorHistory((current) => {
      if (current.operations.length === 0) {
        return current;
      }

      return {
        operations: current.operations.slice(0, -1),
        redoStack: [],
        undoStack: [...current.undoStack, current.operations],
      };
    });
  };

  const handleCanvasPointerDown = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!annotationCanvasRef.current) {
      return;
    }

    setError(null);

    const canvas = annotationCanvasRef.current;
    const canvasPoint = getCanvasPoint(event, canvas);

    if (annotationTool === 'text') {
      // Commit any in-progress text BEFORE clearing refs (pointerdown fires before blur)
      const existingText = inlineTextRef.current.trim();
      const existingCursor = textCursorRef.current;
      if (existingText && existingCursor) {
        appendOperation({
          id: createOperationId(),
          type: 'text',
          style: { color: annotationColorRef.current, size: annotationSizeRef.current },
          point: existingCursor.canvasPoint,
          text: existingText,
        });
      }
      // Now place new cursor
      const domX = event.clientX;
      const domY = event.clientY;
      inlineTextRef.current = '';
      textCursorRef.current = { domX, domY, canvasPoint };
      setInlineText('');
      setTextCursor({ domX, domY, canvasPoint });
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
            points: [canvasPoint],
          }
        : annotationTool === 'rectangle'
          ? {
              id: createOperationId(),
              type: 'rectangle',
              style,
              start: canvasPoint,
              end: canvasPoint,
            }
          : {
              id: createOperationId(),
              type: 'arrow',
              style,
              start: canvasPoint,
              end: canvasPoint,
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
      appendOperation({ ...activeDraft, points });
      return;
    }

    if (!isShapeMeaningful(activeDraft.start, activeDraft.end)) {
      return;
    }

    appendOperation(activeDraft);
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
      const previewUrl = annotationCanvasRef.current.toDataURL('image/png');
      const file = await canvasToFile(annotationCanvasRef.current, editorImage.fileName);
      const uploaded = await uploadImageFile(file);
      if (uploaded) {
        setScreenshotPreviewUrl(previewUrl);
        closeAnnotationEditor();
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to export image.');
    }
  };

  const handleRemoveScreenshot = async (): Promise<void> => {
    if (!screenshotId) {
      setScreenshotPreviewUrl(null);
      return;
    }

    if (!onDeleteScreenshot) {
      setScreenshotId(null);
      setScreenshotPreviewUrl(null);
      return;
    }

    setDeletingScreenshot(true);
    setError(null);

    try {
      const result = await onDeleteScreenshot(screenshotId);
      if (!result.success) {
        setError(result.error);
        return;
      }

      setScreenshotId(null);
      setScreenshotPreviewUrl(null);
      setNotice('Screenshot removed.');
    } finally {
      setDeletingScreenshot(false);
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
    setScreenshotPreviewUrl(null);
    setNotice(null);
    setSubmitted(true);
  };

  const currentHasUndo = editorHistory.undoStack.length > 0;
  const currentHasRedo = editorHistory.redoStack.length > 0;
  const hasAnnotations = editorHistory.operations.length > 0;

  const toolBtn = (tool: AnnotationTool, icon: React.ReactNode, label: string) => (
    <button
      key={tool}
      type="button"
      title={label}
      onClick={() => setAnnotationTool(tool)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
        borderRadius: '6px',
        border: annotationTool === tool ? '1px solid #4ade80' : '1px solid #334155',
        background: annotationTool === tool ? 'rgba(74,222,128,0.12)' : '#0f172a',
        color: annotationTool === tool ? '#4ade80' : '#94a3b8',
        padding: '5px 9px',
        cursor: 'pointer',
        fontSize: '12px',
        fontWeight: 500,
      }}
    >
      {icon}
      {label}
    </button>
  );

  const iconBtn = (
    onClick: () => void,
    icon: React.ReactNode,
    label: string,
    disabled = false,
  ) => (
    <button
      type="button"
      title={label}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        borderRadius: '6px',
        border: '1px solid #334155',
        background: '#0f172a',
        color: disabled ? '#475569' : '#94a3b8',
        padding: '5px 9px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: '12px',
      }}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <>
      <style>{`
        @keyframes afb-spin-in {
          from { transform: rotate(-90deg) scale(0.7); opacity: 0; }
          to   { transform: rotate(0deg)  scale(1);   opacity: 1; }
        }
        .afb-icon-enter {
          animation: afb-spin-in 0.18s ease forwards;
        }
      `}</style>

      {/* Floating toggle button */}
      <button
        type="button"
        onClick={() => {
          if (submitted) return;
          setOpen((v) => !v);
        }}
        title={open ? 'Close feedback' : 'Send feedback'}
        style={{
          position: 'fixed',
          right: '20px',
          bottom: '20px',
          zIndex: 9999,
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          backgroundColor: open ? '#374151' : '#15803d',
          color: '#ffffff',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
          transition: 'background-color 0.2s ease, transform 0.15s ease',
          visibility: capturingScreen ? 'hidden' : 'visible',
        }}
      >
        <span key={open ? 'x' : 'chat'} className="afb-icon-enter">
          {open ? <XIcon size={20} /> : <ChatIcon />}
        </span>
      </button>

      {/* Feedback panel — always mounted, CSS-driven visibility */}
      <div
        style={{
          position: 'fixed',
          right: '20px',
          bottom: '80px',
          width: '360px',
          background: '#0f172a',
          color: '#f1f5f9',
          borderRadius: '14px',
          border: '1px solid #1e293b',
          padding: '0',
          zIndex: 9999,
          boxShadow: '0 16px 48px rgba(0,0,0,0.55)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 'calc(100vh - 110px)',
          opacity: open ? 1 : 0,
          transform: open ? 'scale(1) translateY(0)' : 'scale(0.92) translateY(8px)',
          pointerEvents: open ? 'auto' : 'none',
          transformOrigin: 'bottom right',
          transition: 'opacity 0.18s ease, transform 0.18s ease',
          visibility: capturingScreen ? 'hidden' : 'visible',
          overflow: 'hidden',
        }}
      >
        {submitted ? (
          /* ── Success screen ── */
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              padding: '40px 24px',
              textAlign: 'center',
              color: '#4ade80',
            }}
          >
            <CheckCircleIcon />
            <div>
              <p style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 600, color: '#f1f5f9' }}>
                Feedback sent!
              </p>
              <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>
                Thank you — we'll take a look.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* ── Header ── */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px 10px',
                borderBottom: '1px solid #1e293b',
              }}
            >
              <div>
                <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#f1f5f9' }}>
                  {title}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b' }}>
                  {currentPath}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                title="Close"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  borderRadius: '6px',
                }}
              >
                <XIcon size={16} />
              </button>
            </div>

            {/* ── Body ── */}
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', minHeight: 0 }}>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={5}
                placeholder="Describe the issue or share your thoughts…"
                style={{
                  width: '100%',
                  borderRadius: '8px',
                  border: '1px solid #1e293b',
                  background: '#1e293b',
                  color: '#f1f5f9',
                  padding: '10px',
                  resize: 'vertical',
                  fontSize: '13px',
                  lineHeight: '1.5',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />

              {/* Tool buttons */}
              {allowScreenshotUpload && onUpload ? (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={handleCaptureScreenshot}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      borderRadius: '7px',
                      border: '1px solid #1e293b',
                      background: '#1e293b',
                      color: '#94a3b8',
                      padding: '5px 9px',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    <CameraIcon />
                    Capture screen
                  </button>
                  <button
                    type="button"
                    onClick={() => setCaptureMode((v) => !v)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      borderRadius: '7px',
                      border: captureMode ? '1px solid #4ade80' : '1px solid #1e293b',
                      background: captureMode ? 'rgba(74,222,128,0.08)' : '#1e293b',
                      color: captureMode ? '#4ade80' : '#94a3b8',
                      padding: '5px 9px',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    <CursorIcon />
                    {captureMode ? 'Click an element…' : 'Capture element'}
                  </button>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      borderRadius: '7px',
                      border: '1px solid #1e293b',
                      background: '#1e293b',
                      color: '#94a3b8',
                      padding: '5px 9px',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    <UploadIcon />
                    {uploading ? 'Uploading…' : uploadLabel}
                    <input
                      type="file"
                      accept={screenshotAllowedMimeTypes.join(',')}
                      onChange={handleUpload}
                      hidden
                    />
                  </label>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setCaptureMode((v) => !v)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      borderRadius: '7px',
                      border: captureMode ? '1px solid #4ade80' : '1px solid #1e293b',
                      background: captureMode ? 'rgba(74,222,128,0.08)' : '#1e293b',
                      color: captureMode ? '#4ade80' : '#94a3b8',
                      padding: '5px 9px',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    <CursorIcon />
                    {captureMode ? 'Click an element…' : 'Capture element'}
                  </button>
                </div>
              )}

              {allowScreenshotUpload && onUpload ? (
                <p style={{ margin: 0, fontSize: '11px', color: '#475569' }}>
                  Paste an image with Ctrl/Cmd+V or capture the current tab first.
                </p>
              ) : null}

              {captureData ? (
                <p style={{ margin: 0, fontSize: '11px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  Element: <code style={{ color: '#94a3b8' }}>{captureData.selector}</code>
                </p>
              ) : null}

              {screenshotId ? (
                <div
                  style={{
                    borderRadius: '10px',
                    border: '1px solid #1e293b',
                    background: '#0a0f1e',
                    padding: '8px',
                  }}
                >
                  {screenshotPreviewUrl ? (
                    <div style={{ marginBottom: '8px', borderRadius: '6px', overflow: 'hidden' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={screenshotPreviewUrl}
                        alt="Annotated screenshot preview"
                        style={{ width: '100%', height: 'auto', display: 'block' }}
                      />
                    </div>
                  ) : null}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>
                      Screenshot attached
                    </p>
                    <button
                      type="button"
                      onClick={handleRemoveScreenshot}
                      disabled={deletingScreenshot}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        borderRadius: '6px',
                        border: '1px solid #7f1d1d',
                        background: '#450a0a',
                        color: '#fca5a5',
                        padding: '3px 8px',
                        cursor: deletingScreenshot ? 'wait' : 'pointer',
                        opacity: deletingScreenshot ? 0.7 : 1,
                        fontSize: '11px',
                      }}
                    >
                      <TrashIcon />
                      {deletingScreenshot ? 'Removing…' : 'Remove'}
                    </button>
                  </div>
                </div>
              ) : null}

              {notice ? (
                <p style={{ margin: 0, color: '#93c5fd', fontSize: '12px' }}>{notice}</p>
              ) : null}
              {error ? (
                <p style={{ margin: 0, color: '#fca5a5', fontSize: '12px' }}>{error}</p>
              ) : null}
            </div>

            {/* ── Footer / Send ── */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                padding: '10px 14px 14px',
                borderTop: '1px solid #1e293b',
              }}
            >
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '7px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#15803d',
                  color: '#f1f5f9',
                  padding: '8px 16px',
                  cursor: submitting ? 'wait' : 'pointer',
                  fontWeight: 600,
                  fontSize: '13px',
                  opacity: submitting ? 0.75 : 1,
                  transition: 'opacity 0.15s ease',
                }}
              >
                <SendIcon />
                {submitting ? 'Sending…' : submitLabel}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Annotation editor */}
      {annotating && editorImage ? (
        <div
          style={{
            position: 'fixed',
            inset: '0',
            zIndex: 10000,
            background: 'rgba(3, 7, 18, 0.96)',
            color: '#f8fafc',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Toolbar */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '10px',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 16px',
              borderBottom: '1px solid rgba(148, 163, 184, 0.15)',
              background: 'rgba(15, 23, 42, 0.97)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <strong style={{ fontSize: '14px', color: '#f1f5f9' }}>Annotate screenshot</strong>
              <span style={{ fontSize: '11px', color: '#475569' }}>{editorImage.fileName}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
              {/* Tool selector */}
              {toolBtn('pen', <PenIcon />, 'Pen')}
              {toolBtn('rectangle', <RectIcon />, 'Rect')}
              {toolBtn('arrow', <ArrowIcon />, 'Arrow')}
              {toolBtn('text', <TextIcon />, 'Text')}

              {/* Color swatches */}
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                {DEFAULT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setAnnotationColor(color)}
                    aria-label={`Select ${color} color`}
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      border: annotationColor === color ? '2px solid #f8fafc' : '1px solid #334155',
                      background: color,
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  />
                ))}
                <input
                  type="color"
                  value={annotationColor}
                  onChange={(e) => setAnnotationColor(e.target.value)}
                  aria-label="Custom color"
                  title="Custom color"
                  style={{ width: '28px', height: '28px', border: 'none', background: 'transparent', cursor: 'pointer' }}
                />
              </div>

              {/* Size */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#64748b' }}>
                Size
                <input
                  type="range"
                  min={1}
                  max={18}
                  value={annotationSize}
                  onChange={(e) => setAnnotationSize(Number(e.target.value))}
                  aria-label="Stroke size"
                  style={{ width: '72px' }}
                />
              </label>

              {/* History controls */}
              {iconBtn(handleUndo, <UndoIcon />, 'Undo', !currentHasUndo)}
              {iconBtn(handleRedo, <RedoIcon />, 'Redo', !currentHasRedo)}
              {iconBtn(handleClearAnnotations, <TrashIcon />, 'Clear', !hasAnnotations)}
            </div>
          </div>

          {/* Canvas area */}
          <div
            ref={annotationScrollRef}
            style={{
              flex: 1,
              overflow: 'auto',
              padding: '16px',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'center',
              position: 'relative',
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
                borderRadius: '12px',
                background: '#ffffff',
                boxShadow: '0 24px 80px rgba(15, 23, 42, 0.6)',
                touchAction: 'none',
                cursor: annotationTool === 'text' ? 'text' : 'crosshair',
              }}
            />
            {/* Inline text input — autoFocus + no onBlur to avoid the pointerdown-before-blur race */}
            {textCursor ? (
              <input
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                ref={textInputRef}
                type="text"
                value={inlineText}
                onChange={(e) => {
                  inlineTextRef.current = e.target.value;
                  setInlineText(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitTextInput();
                  }
                  if (e.key === 'Escape') {
                    textCursorRef.current = null;
                    setTextCursor(null);
                    setInlineText('');
                    inlineTextRef.current = '';
                  }
                }}
                placeholder="Type → Enter to place"
                style={{
                  position: 'fixed',
                  left: textCursor.domX,
                  top: textCursor.domY,
                  minWidth: '180px',
                  background: 'rgba(15, 23, 42, 0.92)',
                  color: annotationColor,
                  border: '1px dashed rgba(255,255,255,0.6)',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  fontSize: `${Math.max(14, annotationSize * 4)}px`,
                  fontWeight: 600,
                  outline: 'none',
                  zIndex: 10002,
                  backdropFilter: 'blur(6px)',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
                }}
              />
            ) : null}
          </div>

          {/* Bottom bar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap',
              padding: '10px 16px',
              borderTop: '1px solid rgba(148, 163, 184, 0.15)',
              background: 'rgba(15, 23, 42, 0.97)',
            }}
          >
            {annotationTool === 'text' ? (
              <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                Click on the image to place text at that position.
              </p>
            ) : (
              <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                Draw on the image, then save when done.
              </p>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={closeAnnotationEditor}
                style={{
                  borderRadius: '8px',
                  border: '1px solid #334155',
                  background: '#0f172a',
                  color: '#94a3b8',
                  padding: '7px 14px',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyAnnotation}
                disabled={uploading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#15803d',
                  color: '#f1f5f9',
                  padding: '7px 14px',
                  cursor: uploading ? 'wait' : 'pointer',
                  opacity: uploading ? 0.8 : 1,
                  fontWeight: 600,
                  fontSize: '13px',
                }}
              >
                <SendIcon />
                {uploading ? 'Uploading…' : 'Save screenshot'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
