import { useEffect, useRef, useState } from 'react';
import ActionButton from '../components/ActionButton';
import FileDropZone from '../components/FileDropZone';
import PageHero from '../components/PageHero';
import { AlertIcon, CopyIcon, DownloadIcon, UnlockIcon } from '../components/Icons';
import { buildDecodedTextFileName, countCharacters, formatBytes } from '../lib/format';
import { downloadBlob, loadImageFile, type LoadedImage } from '../lib/image';
import { extractSecret } from '../lib/carrier';
import { decompressSecret, deserializeSecretContent } from '../lib/secret-payload';
import type { HiddenAttachment } from '../lib/secret-payload';

interface RevealedResult {
  message: string;
  attachment: HiddenAttachment | null;
  channel: 'stealth' | 'rugged';
}

function DecodePage() {
  const [sourceImage, setSourceImage] = useState<LoadedImage | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);
  const [result, setResult] = useState<RevealedResult | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);

  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    previewUrlRef.current = sourceImage?.previewUrl ?? null;

    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, [sourceImage]);

  useEffect(() => {
    if (!result?.attachment) {
      setAttachmentUrl(null);
      return;
    }

    const url = URL.createObjectURL(
      new Blob([result.attachment.bytes as BlobPart], { type: result.attachment.mimeType }),
    );
    setAttachmentUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [result]);

  const resetResult = () => {
    setResult(null);
    setCopyFailed(false);
  };

  const handleFileSelected = async (file: File) => {
    setErrorMessage(null);
    resetResult();
    setIsReadingFile(true);

    try {
      setSourceImage(await loadImageFile(file));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not load the image.');
    } finally {
      setIsReadingFile(false);
    }
  };

  const handleReveal = async (): Promise<boolean> => {
    if (!sourceImage) {
      return false;
    }

    setErrorMessage(null);
    resetResult();
    setIsRevealing(true);

    try {
      const outcome = await extractSecret({
        pngBytes: sourceImage.fileBytes,
        imageData: sourceImage.imageData,
      });

      const plaintext = await decompressSecret(outcome.plaintext);
      const content = deserializeSecretContent(plaintext);

      setResult({
        message: content.message,
        attachment: content.attachment,
        channel: outcome.channel,
      });

      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Extraction failed.');
      return false;
    } finally {
      setIsRevealing(false);
    }
  };

  const handleCopy = async (): Promise<boolean> => {
    if (!result?.message) {
      return false;
    }

    setCopyFailed(false);

    try {
      await navigator.clipboard.writeText(result.message);
      return true;
    } catch {
      setCopyFailed(true);
      return false;
    }
  };

  const handleDownloadMessage = () => {
    if (!result?.message) {
      return;
    }

    downloadBlob(
      new Blob([result.message], { type: 'text/plain;charset=utf-8' }),
      buildDecodedTextFileName(sourceImage?.fileName ?? 'silentlayer'),
    );
  };

  const handleDownloadAttachment = () => {
    if (!result?.attachment) {
      return;
    }

    downloadBlob(
      new Blob([result.attachment.bytes as BlobPart], { type: result.attachment.mimeType }),
      result.attachment.fileName,
    );
  };

  return (
    <section className="page">
      <PageHero
        eyebrow="Extract"
        headline="Open a sealed image."
        lead="Drop in any image this workspace produced and read what is inside it. Detection and decryption run on your machine — nothing is uploaded, and the picture itself never changes."
        steps={[
          {
            label: 'Drop the image',
            detail: 'The original PNG, or a copy that went through a chat app.',
          },
          {
            label: 'Extract',
            detail: 'Both layers are checked; whichever is intact opens the payload.',
          },
          {
            label: 'Read or save',
            detail: 'The message and any hidden file come back exactly as they went in.',
          },
        ]}
      />

      <div className="workspace">
        <div className="panel">
          <h2 className="panel__title">1. The image</h2>

          <FileDropZone
            accept="image/*"
            title={isReadingFile ? 'Reading the image…' : 'Drag an image here'}
            hint="Works on an original PNG as well as on a copy that was JPEG-recompressed."
            selectedFileName={sourceImage?.fileName ?? null}
            onFileSelected={(file) => void handleFileSelected(file)}
            disabled={isReadingFile || isRevealing}
          />

          {sourceImage ? (
            <div className="source-summary">
              <img
                className="thumbnail"
                src={sourceImage.previewUrl}
                alt="Preview of the image being inspected"
              />
              <dl className="meta-list">
                <div>
                  <dt>Dimensions</dt>
                  <dd className="mono" dir="ltr">
                    {sourceImage.imageData.width} × {sourceImage.imageData.height}
                  </dd>
                </div>
                <div>
                  <dt>Size</dt>
                  <dd className="mono" dir="ltr">
                    {formatBytes(sourceImage.fileSizeBytes)}
                  </dd>
                </div>
                <div>
                  <dt>Type</dt>
                  <dd>{sourceImage.isPng ? 'Original PNG' : 'Recompressed'}</dd>
                </div>
              </dl>
            </div>
          ) : null}

          {errorMessage ? (
            <p className="alert alert--error" role="alert">
              <AlertIcon size={16} className="alert__icon" />
              <span>{errorMessage}</span>
            </p>
          ) : null}

          <ActionButton
            variant="primary"
            idleLabel="Extract the content"
            busyLabel="Decrypting…"
            successLabel="Opened"
            idleIcon={<UnlockIcon size={15} />}
            onAction={handleReveal}
            disabled={!sourceImage || isReadingFile || isRevealing}
          />
        </div>

        <div className="panel panel--muted">
          <h2 className="panel__title">2. What was hidden</h2>

          {result ? (
            <div className="decoded">
              <p className="channel-badge">
                {result.channel === 'stealth'
                  ? 'Read from the signature-free layer — an exact, byte-perfect recovery'
                  : 'Read from the resilient layer — the image was recompressed and the content survived'}
              </p>

              {result.message ? (
                <>
                  <pre className="decoded__text" dir="auto">
                    {result.message}
                  </pre>

                  <div className="decoded__meta">
                    <span>
                      {countCharacters(result.message)}{' '}
                      {countCharacters(result.message) === 1 ? 'character' : 'characters'}
                    </span>
                    <span className="mono" dir="ltr">
                      {formatBytes(new TextEncoder().encode(result.message).length)}
                    </span>
                  </div>

                  <div className="result__actions">
                    <ActionButton
                      idleLabel="Copy the message"
                      successLabel="Copied"
                      idleIcon={<CopyIcon size={14} />}
                      onAction={handleCopy}
                      successHoldMs={1600}
                    />
                    <ActionButton
                      idleLabel="Download as text"
                      successLabel="Saved"
                      idleIcon={<DownloadIcon size={14} />}
                      onAction={async () => {
                        handleDownloadMessage();
                        return true;
                      }}
                      successHoldMs={1600}
                    />
                  </div>

                  {copyFailed ? (
                    <p className="alert alert--warning" role="status">
                      <AlertIcon size={16} className="alert__icon" />
                      <span>
                        The browser blocked automatic copying. Please select the text manually.
                      </span>
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="empty-state">No text message was hidden, only a file.</p>
              )}

              {result.attachment ? (
                <div className="attachment-result">
                  <div className="attachment-result__info">
                    <span className="attachment-result__name mono" dir="ltr">
                      {result.attachment.fileName}
                    </span>
                    <span className="field__hint">
                      {result.attachment.mimeType} · {formatBytes(result.attachment.bytes.length)}
                    </span>
                  </div>

                  {result.attachment.mimeType.startsWith('image/') && attachmentUrl ? (
                    <img
                      className="attachment-result__preview"
                      src={attachmentUrl}
                      alt="The hidden file that was extracted"
                    />
                  ) : null}

                  <ActionButton
                    idleLabel="Download the hidden file"
                    successLabel="Saved"
                    idleIcon={<DownloadIcon size={14} />}
                    onAction={async () => {
                      handleDownloadAttachment();
                      return true;
                    }}
                    successHoldMs={1600}
                  />
                </div>
              ) : null}
            </div>
          ) : (
            <p className="empty-state">The hidden content will appear here.</p>
          )}
        </div>
      </div>
    </section>
  );
}

export default DecodePage;
