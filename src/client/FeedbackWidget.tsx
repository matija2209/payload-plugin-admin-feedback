'use client';

import React from 'react';

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

const canvasToFile = async (canvas: HTMLCanvasElement): Promise<File> => {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((nextBlob) => resolve(nextBlob), 'image/png');
  });

  if (!blob) {
    throw new Error('Failed to prepare annotated screenshot.');
  }

  return new File([blob], `feedback-${Date.now()}.png`, { type: 'image/png' });
};

export function FeedbackWidget({
  title = 'Admin feedback',
  submitLabel = 'Send',
  uploadLabel = 'Upload image',
  allowScreenshotUpload = true,
  screenshotMaxFileSizeBytes = 5 * 1024 * 1024,
  screenshotAllowedMimeTypes = ['image/png', 'image/jpeg', 'image/webp'],
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
  const [currentPath, setCurrentPath] = React.useState('/');
  const [annotating, setAnnotating] = React.useState(false);
  const [annotationImage, setAnnotationImage] = React.useState<string | null>(null);
  const [annotationColor, setAnnotationColor] = React.useState('#ef4444');
  const [annotationSize, setAnnotationSize] = React.useState(3);
  const hoverTargetRef = React.useRef<Element | null>(null);
  const annotationCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const drawingRef = React.useRef(false);
  const lastPointRef = React.useRef<AnnotationPoint | null>(null);


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

  const validateImageFile = (file: File): string | null => {
    if (!screenshotAllowedMimeTypes.includes(file.type)) {
      const message = `Supported image types: ${screenshotAllowedMimeTypes.join(', ')}`;
      return message;
    }

    if (file.size > screenshotMaxFileSizeBytes) {
      const message = `Image is too large. Maximum size: ${Math.round(screenshotMaxFileSizeBytes / 1024 / 1024)}MB.`;
      return message;
    }

    return null;
  };

  const uploadImageFile = async (file: File): Promise<void> => {
    if (!onUpload) {
      return;
    }

    setError(null);
    setUploading(true);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('alt', file.name);
    const result = await onUpload(formData);
    setUploading(false);

    if (result.success) {
      setScreenshotId(result.mediaId);
    } else {
      setError(result.error);
    }
  };

  const handleStartAnnotation = async (file: File): Promise<void> => {
    const validationError = validateImageFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      setAnnotationImage(dataUrl);
      setAnnotating(true);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to process image.');
    }
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (file) {
      await handleStartAnnotation(file);
    }
    event.target.value = '';
  };

  const handleCaptureScreenshot = async (): Promise<void> => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError('Browser does not support screen capture.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'browser' as const },
        audio: false,
      });

      const track = stream.getVideoTracks()[0];
      if (!track) {
        setError('Screen capture failed.');
        return;
      }

      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await video.play();

      const width = video.videoWidth || window.innerWidth;
      const height = video.videoHeight || window.innerHeight;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) {
        setError('Browser does not support canvas context.');
        stream.getTracks().forEach((item) => item.stop());
        return;
      }

      context.drawImage(video, 0, 0, width, height);
      video.pause();
      stream.getTracks().forEach((item) => item.stop());

      const captureFile = await canvasToFile(canvas);
      await handleStartAnnotation(captureFile);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Screen capture failed.');
    }
  };

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
    if (!annotating || !annotationImage || !annotationCanvasRef.current) {
      return;
    }

    const canvas = annotationCanvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) {
      setError('Browser does not support canvas context.');
      return;
    }

    const image = new Image();
    image.onload = () => {
      const maxWidth = 640;
      const scale = image.width > maxWidth ? maxWidth / image.width : 1;
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = annotationImage;
  }, [annotating, annotationImage]);

  const drawSegment = (
    context: CanvasRenderingContext2D,
    fromPoint: AnnotationPoint,
    toPoint: AnnotationPoint,
  ): void => {
    context.strokeStyle = annotationColor;
    context.lineWidth = annotationSize;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(fromPoint.x, fromPoint.y);
    context.lineTo(toPoint.x, toPoint.y);
    context.stroke();
  };

  const getPoint = (
    event: React.MouseEvent<HTMLCanvasElement>,
    canvas: HTMLCanvasElement,
  ): AnnotationPoint => {
    const bounds = canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  const handleCanvasPointerDown = (event: React.MouseEvent<HTMLCanvasElement>): void => {
    if (!annotationCanvasRef.current) {
      return;
    }

    const nextPoint = getPoint(event, annotationCanvasRef.current);
    drawingRef.current = true;
    lastPointRef.current = nextPoint;
  };

  const handleCanvasPointerMove = (event: React.MouseEvent<HTMLCanvasElement>): void => {
    if (!drawingRef.current || !annotationCanvasRef.current) {
      return;
    }

    const canvas = annotationCanvasRef.current;
    const context = canvas.getContext('2d');
    if (!context || !lastPointRef.current) {
      return;
    }

    const nextPoint = getPoint(event, canvas);
    drawSegment(context, lastPointRef.current, nextPoint);
    lastPointRef.current = nextPoint;
  };

  const handleCanvasPointerUp = (): void => {
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  const handleApplyAnnotation = async (): Promise<void> => {
    if (!annotationCanvasRef.current) {
      return;
    }

    try {
      const file = await canvasToFile(annotationCanvasRef.current);
      await uploadImageFile(file);
      setAnnotating(false);
      setAnnotationImage(null);
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
    setOpen(false);
  };

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
                <input type="file" onChange={handleUpload} hidden />
              </label>
            ) : null}
          </div>
          {allowScreenshotUpload && onUpload ? (
            <p style={{ margin: '8px 0 0', fontSize: '11px', opacity: 0.8 }}>
              Paste an image from clipboard with Ctrl/Cmd+V.
            </p>
          ) : null}
          {captureData ? (
            <p style={{ margin: '8px 0 0', fontSize: '12px', opacity: 0.8 }}>
              Selector: {captureData.selector}
            </p>
          ) : null}
          {screenshotId ? (
            <p style={{ margin: '4px 0 0', fontSize: '12px', opacity: 0.8 }}>Media ID: {screenshotId}</p>
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
      {annotating ? (
        <div
          style={{
            position: 'fixed',
            inset: '0',
            zIndex: 10000,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            style={{
              background: '#111827',
              border: '1px solid #374151',
              borderRadius: '12px',
              padding: '12px',
              width: 'min(90vw, 760px)',
            }}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: '16px', color: '#f9fafb' }}>Annotate image</h3>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
              <input
                type="color"
                value={annotationColor}
                onChange={(event) => setAnnotationColor(event.target.value)}
                aria-label="Annotation color"
              />
              <input
                type="range"
                min={1}
                max={12}
                value={annotationSize}
                onChange={(event) => setAnnotationSize(Number(event.target.value))}
                aria-label="Annotation thickness"
              />
            </div>
            <div style={{ overflow: 'auto', maxHeight: '70vh' }}>
              <canvas
                ref={annotationCanvasRef}
                onMouseDown={handleCanvasPointerDown}
                onMouseMove={handleCanvasPointerMove}
                onMouseUp={handleCanvasPointerUp}
                onMouseLeave={handleCanvasPointerUp}
                style={{ width: '100%', cursor: 'crosshair', display: 'block' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
              <button
                type="button"
                onClick={() => {
                  setAnnotating(false);
                  setAnnotationImage(null);
                }}
                style={{
                  borderRadius: '8px',
                  border: '1px solid #4b5563',
                  background: '#1f2937',
                  color: '#f9fafb',
                  padding: '6px 10px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyAnnotation}
                style={{
                  borderRadius: '8px',
                  border: 'none',
                  background: '#16a34a',
                  color: '#f9fafb',
                  padding: '6px 10px',
                  cursor: 'pointer',
                }}
              >
                Apply image
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
