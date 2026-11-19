import { useEffect, useMemo, useRef, useState } from 'react';
import ActionButton from '../components/ActionButton';
import FileDropZone from '../components/FileDropZone';
import PageHero from '../components/PageHero';
import {
  AlertIcon,
  DownloadIcon,
  LockIcon,
  ShieldIcon,
  TrashIcon,
  WavesIcon,
} from '../components/Icons';
import { buildEncodedFileName, countCharacters, formatBytes } from '../lib/format';
import {
  bytesToBlobUrl,
  downloadBlob,
  getPngBytesForImage,
  loadFileBytes,
  loadImageFile,
  type LoadedImage,
} from '../lib/image';
import { embedSecret, getRuggedCapacity } from '../lib/carrier';
import { encodedLengthFor } from '../lib/ecc-framing';
import { compressSecret, serializeSecretContent } from '../lib/secret-payload';
import { getEnvelopeOverhead } from '../lib/envelope';
import { isUsingDevelopmentKey } from '../lib/keyvault';

interface SealedResult {
  pngBytes: Uint8Array;
  previewUrl: string;
  fileName: string;
  stealthByteLength: number;
  ruggedChannelUsed: boolean;
  channelCount: number;
}

interface AttachmentState {
  fileName: string;
  mimeType: string;
  byteLength: number;
  bytes: Uint8Array;
}

function EncodePage() {
  const [coverImage, setCoverImage] = useState<LoadedImage | null>(null);
  const [message, setMessage] = useState('');
  const [attachment, setAttachment] = useState<AttachmentState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isReadingImage, setIsReadingImage] = useState(false);
  const [isReadingAttachment, setIsReadingAttachment] = useState(false);
  const [isSealing, setIsSealing] = useState(false);
  const [result, setResult] = useState<SealedResult | null>(null);

  const coverUrlRef = useRef<string | null>(null);
  const resultUrlRef = useRef<string | null>(null);

  const usesDevKey = isUsingDevelopmentKey();

  useEffect(() => {
    coverUrlRef.current = coverImage?.previewUrl ?? null;

    return () => {
      if (coverUrlRef.current) {
        URL.revokeObjectURL(coverUrlRef.current);
      }
    };
  }, [coverImage]);

  useEffect(() => {
    resultUrlRef.current = result?.previewUrl ?? null;

    return () => {
      if (resultUrlRef.current) {
        URL.revokeObjectURL(resultUrlRef.current);
      }
    };
  }, [result]);

  const ruggedCapacity = useMemo(() => {
    if (!coverImage) {
      return null;
    }

    const capacity = getRuggedCapacity(
      coverImage.imageData.width,
      coverImage.imageData.height,
      0,
    );

    return {
      ...capacity,
      usableBytes: Math.max(0, capacity.usableBytes - getEnvelopeOverhead()),
    };
  }, [coverImage]);

  const ruggedFitsHardLimit =
    ruggedCapacity !== null && ruggedCapacity.usableBytes > 0;

  const clearResult = () => setResult(null);

  const handleCoverSelected = async (file: File) => {
    setErrorMessage(null);
    clearResult();
    setIsReadingImage(true);

    try {
      setCoverImage(await loadImageFile(file));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not load the image.');
    } finally {
      setIsReadingImage(false);
    }
  };

  const handleAttachmentSelected = async (file: File) => {
    setErrorMessage(null);
    clearResult();
    setIsReadingAttachment(true);

    try {
      const bytes = await loadFileBytes(file);
      setAttachment({
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        byteLength: bytes.length,
        bytes,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not load the file.');
    } finally {
      setIsReadingAttachment(false);
    }
  };

  const handleSeal = async (): Promise<boolean> => {
    if (!coverImage) {
      return false;
    }

    setErrorMessage(null);
    clearResult();
    setIsSealing(true);

    try {
      const plaintext = await compressSecret(
        serializeSecretContent({
          message,
          attachment: attachment
            ? {
                fileName: attachment.fileName,
                mimeType: attachment.mimeType,
                bytes: attachment.bytes,
              }
            : null,
        }),
      );

      const sealedLength = plaintext.length + getEnvelopeOverhead();
      const capacity = getRuggedCapacity(
        coverImage.imageData.width,
        coverImage.imageData.height,
        0,
      );
      const includeRuggedChannel = encodedLengthFor(sealedLength) <= capacity.capacityInBytes;

      const basePngBytes = await getPngBytesForImage(coverImage);

      const outcome = await embedSecret({
        pngBytes: basePngBytes,
        imageData: coverImage.imageData,
        plaintext,
        includeRuggedChannel,
      });

      setResult({
        pngBytes: outcome.pngBytes,
        previewUrl: bytesToBlobUrl(outcome.pngBytes, 'image/png'),
        fileName: buildEncodedFileName(coverImage.fileName),
        stealthByteLength: outcome.stealthByteLength,
        ruggedChannelUsed: outcome.ruggedChannelUsed,
        channelCount: outcome.ruggedChannelUsed ? 2 : 1,
      });

      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Hiding the content failed.');
      return false;
    } finally {
      setIsSealing(false);
    }
  };

  const handleDownload = () => {
    if (!result) {
      return;
    }

    downloadBlob(new Blob([result.pngBytes as BlobPart], { type: 'image/png' }), result.fileName);
  };

  const hasContent = message.trim().length > 0 || attachment !== null;
  const canSeal = Boolean(coverImage) && hasContent;

  return (
    <section className="page">
      <PageHero
        eyebrow="Embed"
        headline="Put a message inside a picture."
        lead="Upload any photo, attach what you want to hide, and download an image that looks exactly the same. The text and files travel inside it, encrypted, and only this workspace can open them again."
        steps={[
          {
            label: 'Choose a photo',
            detail: 'Any picture works. It becomes the envelope everything rides in.',
          },
          {
            label: 'Write a message or attach a file',
            detail: 'Text, a PDF, a ZIP — it all gets packed in before anything is written.',
          },
          {
            label: 'Download the sealed image',
            detail: 'Send it anywhere. Pixels stay untouched; the payload sits outside them.',
          },
        ]}
      />

      {usesDevKey ? (
        <p className="alert alert--error" role="alert">
          <AlertIcon size={16} className="alert__icon" />
          <span>
          The built-in key is the public default. Set{' '}
          <code className="mono">VITE_SILENTLAYER_WORKSPACE_KEY</code> in a{' '}
          <code className="mono">.env</code> file and rebuild, otherwise anyone who has the
          site can extract your content.
          </span>
        </p>
      ) : null}

      <div className="workspace">
        <div className="panel">
          <h2 className="panel__title">1. Cover image</h2>

          <FileDropZone
            accept="image/png,image/jpeg,image/webp,image/bmp,image/gif,image/avif"
            title={isReadingImage ? 'Reading the image…' : 'Drag an image here or click to browse'}
            hint="A PNG is kept exactly as is. Other formats are converted once to lossless PNG."
            selectedFileName={coverImage?.fileName ?? null}
            onFileSelected={(file) => void handleCoverSelected(file)}
            disabled={isReadingImage || isSealing}
          />

          {coverImage ? (
            <div className="source-summary">
              <img
                className="thumbnail"
                src={coverImage.previewUrl}
                alt="Preview of the cover image"
              />
              <dl className="meta-list">
                <div>
                  <dt>Dimensions</dt>
                  <dd className="mono" dir="ltr">
                    {coverImage.imageData.width} × {coverImage.imageData.height}
                  </dd>
                </div>
                <div>
                  <dt>Resilient layer capacity</dt>
                  <dd className="mono" dir="ltr">
                    {ruggedCapacity ? formatBytes(ruggedCapacity.usableBytes) : '—'}
                  </dd>
                </div>
                <div>
                  <dt>Preservation</dt>
                  <dd>{coverImage.isPng ? 'Identical pixels' : 'One-time conversion'}</dd>
                </div>
              </dl>
            </div>
          ) : null}

          <h2 className="panel__title">2. What to hide</h2>

          <label className="field">
            <span className="field__label">Message (no length limit)</span>
            <textarea
              className="field__textarea"
              value={message}
              onChange={(event) => {
                setMessage(event.target.value);
                clearResult();
                setErrorMessage(null);
              }}
              placeholder="Type anything here…"
              rows={6}
              disabled={isSealing}
            />
          </label>

          <div className="field__footer">
            <span>
              {countCharacters(message)}{' '}
              {countCharacters(message) === 1 ? 'character' : 'characters'}
            </span>
            <span className="mono" dir="ltr">
              {formatBytes(new TextEncoder().encode(message).length)}
            </span>
          </div>

          <div className="attachment-block">
            <div className="attachment-block__header">
              <span className="field__label">Hidden file (optional)</span>
              <span className="field__hint">An image inside an image, a PDF, a ZIP</span>
            </div>

            <FileDropZone
              accept="*/*"
              title={isReadingAttachment ? 'Reading the file…' : 'Add a file to hide'}
              hint="The file itself is never visible in the image."
              selectedFileName={
                attachment ? `${attachment.fileName} · ${formatBytes(attachment.byteLength)}` : null
              }
              onFileSelected={(file) => void handleAttachmentSelected(file)}
              disabled={isReadingAttachment || isSealing}
              compact
              icon="file"
            />

            {attachment ? (
              <button
                className="button button--ghost button--small"
                type="button"
                onClick={() => {
                  setAttachment(null);
                  clearResult();
                }}
                disabled={isSealing}
              >
                <TrashIcon size={14} />
                Remove file
              </button>
            ) : null}
          </div>

          {coverImage && !ruggedFitsHardLimit ? (
            <p className="alert alert--warning">
              <AlertIcon size={16} className="alert__icon" />
              <span>
                This image is too small to carry the recompression-resilient layer. The content
                will be hidden in the signature-free layer only — it survives any viewing, but
                not a conversion to JPEG.
              </span>
            </p>
          ) : null}

          {errorMessage ? (
            <p className="alert alert--error" role="alert">
              <AlertIcon size={16} className="alert__icon" />
              <span>{errorMessage}</span>
            </p>
          ) : null}

          <ActionButton
            variant="primary"
            idleLabel="Hide in the image"
            busyLabel="Sealing and hiding…"
            successLabel="Sealed"
            idleIcon={<LockIcon size={15} />}
            onAction={handleSeal}
            disabled={!canSeal}
          />
        </div>

        <div className="panel panel--muted">
          <h2 className="panel__title">3. The protected image</h2>

          {result ? (
            <div className="result">
              <img
                className="result__preview"
                src={result.previewUrl}
                alt="The image containing the hidden content"
              />

              <ul className="result__facts">
                <li>
                  <ShieldIcon size={14} className="fact__icon" />
                  <span>No signature, no chunk name, and no header that a scan could identify.</span>
                </li>
                <li>
                  <LockIcon size={14} className="fact__icon" />
                  <span>
                    {result.channelCount} {result.channelCount === 1 ? 'layer' : 'layers'} written
                    · {formatBytes(result.stealthByteLength)} encrypted
                  </span>
                </li>
                <li>
                  <WavesIcon size={14} className="fact__icon" />
                  <span>
                    {result.ruggedChannelUsed
                      ? 'The resilient layer is active — it survives strong JPEG recompression.'
                      : 'The resilient layer did not fit because the content is too large, so only the signature-free layer was written.'}
                  </span>
                </li>
                <li>
                  <ShieldIcon size={14} className="fact__icon" />
                  <span>It looks identical to the original; there is no visual sign of content.</span>
                </li>
              </ul>

              <div className="result__actions">
                <ActionButton
                  variant="primary"
                  idleLabel="Download the image"
                  successLabel="Saved"
                  idleIcon={<DownloadIcon size={15} />}
                  onAction={async () => {
                    handleDownload();
                    return true;
                  }}
                  successHoldMs={1800}
                />
                <span className="mono result__file" dir="ltr">
                  {result.fileName}
                </span>
              </div>
            </div>
          ) : (
            <p className="empty-state">
              Once you hide something, the image will appear here with a download button. It
              will look identical to the original.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export default EncodePage;
