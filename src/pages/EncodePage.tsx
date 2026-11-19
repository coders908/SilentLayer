import { useEffect, useMemo, useRef, useState } from 'react';
import ActionButton from '../components/ActionButton';
import FileDropZone from '../components/FileDropZone';
import PageHero from '../components/PageHero';
import PassphraseField from '../components/PassphraseField';
import {
  AlertIcon,
  DownloadIcon,
  GaugeIcon,
  KeyIcon,
  LayersIcon,
  LockIcon,
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
import {
  MIN_PASSPHRASE_LENGTH,
  isUsingDevelopmentKey,
  isValidPassphrase,
} from '../lib/keyvault';

interface SealedResult {
  pngBytes: Uint8Array;
  previewUrl: string;
  fileName: string;
  stealthByteLength: number;
  ruggedChannelUsed: boolean;
  passphraseProtected: boolean;
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
  const [passphrase, setPassphrase] = useState('');
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
      getEnvelopeOverhead(),
    );

    return capacity;
  }, [coverImage]);

  const ruggedAvailable = ruggedCapacity !== null && ruggedCapacity.usableBytes > 0;

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

  const handleSeal = async (reportProgress: (ratio: number) => void): Promise<boolean> => {
    if (!coverImage) {
      return false;
    }

    setErrorMessage(null);
    clearResult();
    setIsSealing(true);

    try {
      reportProgress(0.04);

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
        getEnvelopeOverhead(),
      );
      const includeRuggedChannel = encodedLengthFor(sealedLength) <= capacity.capacityInBytes;

      const basePngBytes = await getPngBytesForImage(coverImage);
      const trimmedPassphrase = passphrase.trim();

      const outcome = await embedSecret({
        pngBytes: basePngBytes,
        imageData: coverImage.imageData,
        plaintext,
        includeRuggedChannel,
        passphrase: trimmedPassphrase.length > 0 ? trimmedPassphrase : null,
        onProgress: (stage, ratio) => {
          if (stage === 'encrypting') {
            reportProgress(0.12);
            return;
          }

          if (stage === 'embedding') {
            reportProgress(0.2 + ratio * 0.75);
          }
        },
      });

      setResult({
        pngBytes: outcome.pngBytes,
        previewUrl: bytesToBlobUrl(outcome.pngBytes, 'image/png'),
        fileName: buildEncodedFileName(coverImage.fileName),
        stealthByteLength: outcome.stealthByteLength,
        ruggedChannelUsed: outcome.ruggedChannelUsed,
        passphraseProtected: trimmedPassphrase.length > 0,
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
  const passphraseIsTooShort =
    passphrase.trim().length > 0 && !isValidPassphrase(passphrase);
  const canSeal = Boolean(coverImage) && hasContent && !passphraseIsTooShort;

  return (
    <section className="page">
      <PageHero
        eyebrow="Hide"
        headline="A message that travels inside the picture."
        lead="Choose a photo, write what you want to keep private, and download an image that looks unchanged. The text and any attached file are encrypted before they are written, and nothing ever leaves your browser."
      />

      {usesDevKey ? (
        <p className="alert alert--error" role="alert">
          <AlertIcon size={16} className="alert__icon" />
          <span>
            This build is using the public default workspace key. Set{' '}
            <code className="mono">VITE_SILENTLAYER_WORKSPACE_KEY</code> in{' '}
            <code className="mono">.env</code> and rebuild, or use a passphrase below - otherwise
            anyone who can serve this site can read the images it produces.
          </span>
        </p>
      ) : null}

      <div className="panel-grid">
        <div className="panel">
          <div className="panel__heading">
            <span className="step-badge mono">01</span>
            <h2 className="panel__title">Cover image</h2>
          </div>

          <FileDropZone
            accept="image/png,image/jpeg,image/webp,image/bmp,image/gif,image/avif"
            title={isReadingImage ? 'Reading the image…' : 'Drop an image, or click to browse'}
            hint="PNG stays byte-identical. Every other format is converted once to lossless PNG."
            selectedFileName={coverImage?.fileName ?? null}
            onFileSelected={(file) => void handleCoverSelected(file)}
            disabled={isReadingImage || isSealing}
          />

          {coverImage ? (
            <div className="source-summary">
              <img
                className="thumbnail"
                src={coverImage.previewUrl}
                alt="Preview of the chosen cover image"
              />
              <dl className="meta-list">
                <div>
                  <dt>Dimensions</dt>
                  <dd className="mono" dir="ltr">
                    {coverImage.imageData.width} × {coverImage.imageData.height}
                  </dd>
                </div>
                <div>
                  <dt>Resilient layer</dt>
                  <dd className="mono" dir="ltr">
                    {ruggedCapacity ? formatBytes(ruggedCapacity.usableBytes) : '-'}
                  </dd>
                </div>
                <div>
                  <dt>Pixels</dt>
                  <dd>{coverImage.isPng ? 'Untouched' : 'Converted once'}</dd>
                </div>
              </dl>
            </div>
          ) : null}

          <div className="panel__heading">
            <span className="step-badge mono">02</span>
            <h2 className="panel__title">What to hide</h2>
          </div>

          <label className="field">
            <span className="field__label">Message</span>
            <textarea
              className="field__textarea"
              value={message}
              onChange={(event) => {
                setMessage(event.target.value);
                clearResult();
                setErrorMessage(null);
              }}
              placeholder="Write anything. Only someone with the key can read it."
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
              <span className="attachment-block__label">
                <span className="field__label">Hidden file</span>
                <span className="optional-pill">Optional</span>
              </span>
              <span className="field__hint">An image inside an image, a PDF, a ZIP</span>
            </div>

            <FileDropZone
              accept="*/*"
              title={isReadingAttachment ? 'Reading the file…' : 'Attach a file to carry along'}
              hint="Compressed and encrypted together with the message."
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

          <div className="panel__heading">
            <span className="step-badge mono">03</span>
            <h2 className="panel__title">Protection</h2>
          </div>

          <PassphraseField
            value={passphrase}
            onChange={(nextValue) => {
              setPassphrase(nextValue);
              clearResult();
            }}
            label="Passphrase"
            hint="Without a passphrase the image can be decoded by anyone who holds this build."
            placeholder="Leave empty to use this build's key"
            minLength={MIN_PASSPHRASE_LENGTH}
            disabled={isSealing}
          />

          {passphrase.trim().length === 0 ? (
            <p className="alert alert--neutral">
              <LockIcon size={16} className="alert__icon alert__icon--muted" />
              <span>
                Sealed with this build&apos;s key only. Anyone who has the same deployment can open
                the image - use a passphrase for anything you send outside it.
              </span>
            </p>
          ) : (
            <p className="alert alert--success">
              <KeyIcon size={16} className="alert__icon" />
              <span>
                Key derived with PBKDF2-HMAC-SHA-256, {MIN_PASSPHRASE_LENGTH}+ characters, random
                salt per image. Only this passphrase can reopen it.
              </span>
            </p>
          )}

          {coverImage && !ruggedAvailable ? (
            <p className="alert alert--warning">
              <AlertIcon size={16} className="alert__icon" />
              <span>
                This image is too small for the compression-resistant layer. The content will be
                hidden in the appended layer only - invisible to a viewer, but not to a JPEG
                re-encode.
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
            busyLabel="Sealing"
            successLabel="Sealed"
            idleIcon={<LockIcon size={15} />}
            onAction={handleSeal}
            disabled={!canSeal}
          />
        </div>

        <div className="panel panel--muted">
          <div className="panel__heading">
            <span className="step-badge mono">04</span>
            <h2 className="panel__title">The sealed image</h2>
          </div>

          {result ? (
            <div className="result">
              <img
                className="result__preview"
                src={result.previewUrl}
                alt="The image containing the hidden content"
              />

              <ul className="result__facts">
                <li>
                  <LayersIcon size={14} className="fact__icon" />
                  <span>
                    Written to{' '}
                    {result.ruggedChannelUsed ? 'both layers' : 'the appended layer'} ·{' '}
                    {formatBytes(result.stealthByteLength)} of ciphertext
                  </span>
                </li>
                <li>
                  <WavesIcon size={14} className="fact__icon" />
                  <span>
                    {result.ruggedChannelUsed
                      ? 'The resilient layer is active and survives strong JPEG recompression.'
                      : 'The payload exceeded this image\u2019s resilient capacity, so only the appended layer was used.'}
                  </span>
                </li>
                <li>
                  <KeyIcon size={14} className="fact__icon" />
                  <span>
                    {result.passphraseProtected
                      ? 'Locked with your passphrase - share it separately from the image.'
                      : 'Locked with this build\u2019s key. Anyone on this deployment can open it.'}
                  </span>
                </li>
                <li>
                  <GaugeIcon size={14} className="fact__icon" />
                  <span>
                    Opening the file in any normal viewer shows the original picture unchanged.
                  </span>
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
              The sealed image appears here with a download button. Pixels in the visible picture
              never change.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export default EncodePage;
