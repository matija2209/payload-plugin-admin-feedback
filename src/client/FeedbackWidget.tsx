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
  onSubmit: (payload: SubmitPayload) => Promise<SubmitResult>;
  onUpload?: (formData: FormData) => Promise<UploadResult>;
};

type CaptureData = {
  selector: string;
  selectedText: string;
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

export function FeedbackWidget({
  title = 'Povratna informacija',
  submitLabel = 'Poslji',
  uploadLabel = 'Nalozi sliko',
  allowScreenshotUpload = true,
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
  const hoverTargetRef = React.useRef<Element | null>(null);

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

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    if (!onUpload) {
      return;
    }

    const file = event.target.files?.[0];
    if (!file) {
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

    event.target.value = '';
  };

  const handleSubmit = async (): Promise<void> => {
    if (!message.trim()) {
      setError('Vnesite sporocilo.');
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
          <h3 style={{ margin: '0 0 8px', fontSize: '16px' }}>{title}</h3>
          <p style={{ margin: '0 0 8px', fontSize: '12px', opacity: 0.8 }}>{currentPath}</p>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={5}
            placeholder="Opisite tezavo..."
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
              {captureMode ? 'Klikni element...' : 'Zajemi element'}
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
                {uploading ? 'Nalagam...' : uploadLabel}
                <input type="file" onChange={handleUpload} hidden />
              </label>
            ) : null}
          </div>
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
              Zapri
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
              {submitting ? 'Posiljam...' : submitLabel}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
