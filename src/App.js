// App.js
import React, { useRef, useState } from "react";
import Webcam from "react-webcam";
import { saveAs } from "file-saver";
import Cropper from "react-easy-crop";
import "./App.css";

// Constants
const DPI_PHOTO = 100;
const DPI_SIGNATURE = 95;
const CM_TO_INCH = 0.393701;

// Calculate pixels per cm
function getPixelsPerCm(dpi) {
  return dpi * CM_TO_INCH;
}

const IMAGE_DIMENSIONS = {
  width: 3.5,
  height: 4.5,
  minSize: 20 * 1024,
  maxSize: 50 * 1024,
  dpi: DPI_PHOTO,
  type: "photo",
};

const SIGNATURE_DIMENSIONS = {
  width: 3.5,
  height: 1.5,
  maxSize: 20 * 1024,
  dpi: DPI_SIGNATURE,
  type: "signature",
};

function cmToPx(cm, isPhoto = true) {
  const dpi = isPhoto ? DPI_PHOTO : DPI_SIGNATURE;
  return Math.round(cm * getPixelsPerCm(dpi));
}

function App() {
  const webcamRef = useRef(null);
  const [mode, setMode] = useState("image");
  const [imageSrc, setImageSrc] = useState(null);
  const [signatureSrc, setSignatureSrc] = useState(null);
  const [resizedImage, setResizedImage] = useState(null);
  const [resizedSignature, setResizedSignature] = useState(null);
  const [imageError, setImageError] = useState("");
  const [signatureError, setSignatureError] = useState("");
  const [facingMode, setFacingMode] = useState("user");
  const [loading, setLoading] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [showCropper, setShowCropper] = useState(false);
  const [tempImage, setTempImage] = useState(null);

  const handleAfterCaptureOrUpload = (src) => {
    setTempImage(src);
    setShowCropper(true);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  };

  const capture = () => {
    const src = webcamRef.current.getScreenshot();
    handleAfterCaptureOrUpload(src);
  };

  const handleSwitchCamera = () => {
    setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      handleAfterCaptureOrUpload(event.target.result);
    };
    reader.readAsDataURL(file);
  };

  const onCropComplete = (croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  };

  const getCroppedImg = async (
    imageSrc,
    cropPixels,
    outputWidth,
    outputHeight,
    isPhoto = true
  ) => {
    const image = new window.Image();
    image.src = imageSrc;
    await new Promise((resolve) => (image.onload = resolve));

    // High quality rendering with scale factor
    const scaleFactor = 2;
    const canvas = document.createElement("canvas");
    canvas.width = outputWidth * scaleFactor;
    canvas.height = outputHeight * scaleFactor;
    const ctx = canvas.getContext("2d");

    // Set high quality rendering
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw image at higher resolution
    ctx.drawImage(
      image,
      cropPixels.x,
      cropPixels.y,
      cropPixels.width,
      cropPixels.height,
      0,
      0,
      canvas.width,
      canvas.height
    );

    // Create final canvas at correct size
    const finalCanvas = document.createElement("canvas");
    finalCanvas.width = outputWidth;
    finalCanvas.height = outputHeight;
    const finalCtx = finalCanvas.getContext("2d");
    finalCtx.imageSmoothingQuality = "high";

    // Downscale with high quality
    finalCtx.drawImage(
      canvas,
      0,
      0,
      canvas.width,
      canvas.height,
      0,
      0,
      finalCanvas.width,
      finalCanvas.height
    );

    return new Promise((resolve) => {
      finalCanvas.toBlob(
        (blob) => {
          const url = URL.createObjectURL(blob);
          resolve({ url, size: blob.size });
        },
        "image/jpeg",
        0.92 // Optimal quality setting
      );
    });
  };

  const handleCropConfirm = async () => {
    const isPhoto = mode === "image";
    const dimensions = isPhoto ? IMAGE_DIMENSIONS : SIGNATURE_DIMENSIONS;
    const widthPx = cmToPx(dimensions.width, isPhoto);
    const heightPx = cmToPx(dimensions.height, isPhoto);

    try {
      const { url, size } = await getCroppedImg(
        tempImage,
        croppedAreaPixels,
        widthPx,
        heightPx,
        isPhoto
      );

      setShowCropper(false);
      setTempImage(null);

      if (isPhoto) {
        setImageSrc({ url, size });
        setResizedImage(null);
        setImageError("");
      } else {
        setSignatureSrc({ url, size });
        setResizedSignature(null);
        setSignatureError("");
      }
    } catch (error) {
      console.error("Error cropping image:", error);
      setImageError("Failed to process image");
    }
  };

  const handleCropCancel = () => {
    setShowCropper(false);
    setTempImage(null);
  };

  const resizeAndCompress = async (src, dimensions, setResized, setError) => {
    setLoading(true);
    setError("");

    try {
      const img = new window.Image();
      img.src = src.url || src;
      await new Promise((resolve) => (img.onload = resolve));

      // High quality rendering with scale factor
      const scaleFactor = 2;
      const canvas = document.createElement("canvas");
      const width =
        cmToPx(dimensions.width, dimensions === IMAGE_DIMENSIONS) * scaleFactor;
      const height =
        cmToPx(dimensions.height, dimensions === IMAGE_DIMENSIONS) *
        scaleFactor;
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      // Create final canvas at correct size
      const finalCanvas = document.createElement("canvas");
      finalCanvas.width = cmToPx(
        dimensions.width,
        dimensions === IMAGE_DIMENSIONS
      );
      finalCanvas.height = cmToPx(
        dimensions.height,
        dimensions === IMAGE_DIMENSIONS
      );
      const finalCtx = finalCanvas.getContext("2d");
      finalCtx.imageSmoothingQuality = "high";
      finalCtx.drawImage(
        canvas,
        0,
        0,
        width,
        height,
        0,
        0,
        finalCanvas.width,
        finalCanvas.height
      );

      let quality = 0.9;
      let blob = await new Promise((res) =>
        finalCanvas.toBlob(res, "image/jpeg", quality)
      );

      let tries = 0;
      while (
        (blob.size > dimensions.maxSize ||
          (dimensions.minSize && blob.size < dimensions.minSize)) &&
        tries < 10
      ) {
        quality += blob.size < (dimensions.minSize || 0) ? 0.05 : -0.05;
        quality = Math.min(1, Math.max(0.5, quality));
        // eslint-disable-next-line no-loop-func
        blob = await new Promise((res) =>
          finalCanvas.toBlob(res, "image/jpeg", quality)
        );
        tries++;
      }

      if (
        blob.size > dimensions.maxSize ||
        (dimensions.minSize && blob.size < dimensions.minSize)
      ) {
        setError(
          `File size: ${Math.round(blob.size / 1024)}KB (Requires: ${
            dimensions.minSize
              ? `${Math.round(dimensions.minSize / 1024)}-`
              : ""
          }${Math.round(dimensions.maxSize / 1024)}KB)`
        );
        setResized(null);
      } else {
        const url = URL.createObjectURL(blob);
        setResized({ url, size: blob.size });
      }
    } catch (e) {
      console.error("Error processing image:", e);
      setError("Image processing failed");
      setResized(null);
    }
    setLoading(false);
  };

  const handleResize = () => {
    if (mode === "image" && imageSrc) {
      resizeAndCompress(
        imageSrc,
        IMAGE_DIMENSIONS,
        setResizedImage,
        setImageError
      );
    } else if (mode === "signature" && signatureSrc) {
      resizeAndCompress(
        signatureSrc,
        SIGNATURE_DIMENSIONS,
        setResizedSignature,
        setSignatureError
      );
    }
  };

  const handleDownload = () => {
    if (mode === "image" && resizedImage) {
      saveAs(resizedImage.url, "photo.jpg");
    } else if (mode === "signature" && resizedSignature) {
      saveAs(resizedSignature.url, "signature.jpg");
    }
  };

  const getFileSize = (src) => {
    if (!src) return "0 KB";
    if (src.size) return `${Math.round(src.size / 1024)} KB`;
    if (src.url) return "Calculating...";
    return "0 KB";
  };

  return (
    <div className="main-container">
      {showCropper && (
        <div className="cropper-modal">
          <div className="cropper-container">
            <h3>Crop your {mode === "image" ? "photo" : "signature"}</h3>
            <div className="cropper-area">
              <Cropper
                image={tempImage}
                crop={crop}
                zoom={zoom}
                aspect={mode === "image" ? 3.5 / 4.5 : 3.5 / 1.5}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>
            <div className="cropper-actions">
              <button
                className="cropper-btn cropper-done"
                onClick={handleCropConfirm}
              >
                Confirm Crop
              </button>
              <button
                className="cropper-btn cropper-cancel"
                onClick={handleCropCancel}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="app-header">
        <h1>ID Photo & Signature Maker</h1>
        <p className="app-subtitle">
          Create perfectly sized documents for official use
        </p>
      </header>

      <div className="mode-switch">
        <button
          className={`mode-btn ${mode === "image" ? "active" : ""}`}
          onClick={() => setMode("image")}
        >
          <span className="mode-icon">📷</span>
          <span>Photo (3.5×4.5 cm)</span>
          <span className="mode-dpi">{DPI_PHOTO} DPI</span>
        </button>
        <button
          className={`mode-btn ${mode === "signature" ? "active" : ""}`}
          onClick={() => setMode("signature")}
        >
          <span className="mode-icon">✍️</span>
          <span>Signature (3.5×1.5 cm)</span>
          <span className="mode-dpi">{DPI_SIGNATURE} DPI</span>
        </button>
      </div>

      <div className="webcam-container">
        <div className="webcam-wrapper">
          <Webcam
            audio={false}
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            width={360}
            height={270}
            videoConstraints={{ facingMode }}
            className="webcam-element"
          />
        </div>
        <div className="webcam-actions">
          <button className="action-btn capture-btn" onClick={capture}>
            <span className="btn-icon">📸</span> Capture
          </button>
          <button
            className="action-btn switch-btn"
            onClick={handleSwitchCamera}
          >
            <span className="btn-icon">🔄</span> Switch Camera
          </button>
          <label className="action-btn upload-label">
            <input
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              hidden
            />
            <span className="btn-icon">📁</span> Upload Image
          </label>
        </div>
      </div>

      <div className="preview-section">
        <div className="preview-block">
          <h3>
            <span className="preview-icon">🖼️</span> Original
          </h3>
          <div className="preview-content">
            {mode === "image" && imageSrc ? (
              <>
                <img
                  src={imageSrc.url || imageSrc}
                  alt="Original"
                  className="preview-img"
                />
                <div className="specs-display">
                  <p>File size: {getFileSize(imageSrc)}</p>
                </div>
              </>
            ) : mode === "signature" && signatureSrc ? (
              <>
                <img
                  src={signatureSrc.url || signatureSrc}
                  alt="Original Signature"
                  className="preview-img"
                />
                <div className="specs-display">
                  <p>File size: {getFileSize(signatureSrc)}</p>
                </div>
              </>
            ) : (
              <div className="preview-placeholder">
                {mode === "image"
                  ? "No photo captured"
                  : "No signature captured"}
              </div>
            )}
          </div>
        </div>

        <div className="preview-block">
          <h3>
            <span className="preview-icon">✨</span> Processed
          </h3>
          <div className="preview-content">
            {mode === "image" && resizedImage ? (
              <>
                <img
                  src={resizedImage.url}
                  alt="Resized"
                  className="preview-img"
                />
                <div className="specs-display">
                  <p>Dimensions: 3.5×4.5 cm</p>
                  <p>Resolution: {DPI_PHOTO} DPI</p>
                  <p>File size: {getFileSize(resizedImage)}</p>
                </div>
              </>
            ) : mode === "signature" && resizedSignature ? (
              <>
                <img
                  src={resizedSignature.url}
                  alt="Resized Signature"
                  className="preview-img"
                />
                <div className="specs-display">
                  <p>Dimensions: 3.5×1.5 cm</p>
                  <p>Resolution: {DPI_SIGNATURE} DPI</p>
                  <p>File size: {getFileSize(resizedSignature)}</p>
                </div>
              </>
            ) : (
              <div className="preview-placeholder">
                {mode === "image"
                  ? "Process photo to see result"
                  : "Process signature to see result"}
              </div>
            )}
            {imageError && mode === "image" && (
              <div className="error-msg">⚠️ {imageError}</div>
            )}
            {signatureError && mode === "signature" && (
              <div className="error-msg">⚠️ {signatureError}</div>
            )}
          </div>
        </div>
      </div>

      <div className="action-buttons">
        <button
          className="primary-btn"
          onClick={handleResize}
          disabled={loading || (mode === "image" ? !imageSrc : !signatureSrc)}
        >
          {loading ? (
            <>
              <span className="spinner"></span> Processing...
            </>
          ) : (
            "Resize & Compress"
          )}
        </button>
        <button
          className="primary-btn download-btn"
          onClick={handleDownload}
          disabled={
            loading || (mode === "image" ? !resizedImage : !resizedSignature)
          }
        >
          <span className="btn-icon">⬇️</span> Download JPG
        </button>
      </div>

      <div className="specs-info">
        <h3 className="specs-title">📋 Specifications</h3>
        <div className="specs-grid">
          <div className="specs-card">
            <h4>Photo Requirements</h4>
            <ul>
              <li>✔️ Dimensions: 3.5 cm × 4.5 cm</li>
              <li>✔️ Resolution: {DPI_PHOTO} DPI</li>
              <li>✔️ File size: 20KB - 50KB</li>
              <li>✔️ White background</li>
              <li>✔️ JPG format</li>
            </ul>
          </div>
          <div className="specs-card">
            <h4>Signature Requirements</h4>
            <ul>
              <li>✔️ Dimensions: 3.5 cm × 1.5 cm</li>
              <li>✔️ Resolution: {DPI_SIGNATURE} DPI</li>
              <li>✔️ File size: Under 20KB</li>
              <li>✔️ White background</li>
              <li>✔️ JPG format</li>
            </ul>
          </div>
        </div>
      </div>

      <footer className="app-footer">
        <p>Created with ❤️ for official document preparation</p>
        <p className="footer-note">
          Note: For best results, ensure good lighting when capturing images
        </p>
      </footer>
    </div>
  );
}

export default App;
