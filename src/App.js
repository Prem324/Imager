import React, { useRef, useState } from "react";
import Webcam from "react-webcam";
import { saveAs } from "file-saver";
import Cropper from "react-easy-crop";
import "./App.css";

const CM_TO_PX = 118.11; // 300 DPI
const IMAGE_DIMENSIONS = { width: 3.5, height: 4.5, maxSize: 50 * 1024 }; // cm, bytes
const SIGNATURE_DIMENSIONS = { width: 3.5, height: 1.5, maxSize: 20 * 1024 }; // cm, bytes

function cmToPx(cm) {
  return Math.round(cm * CM_TO_PX);
}

function App() {
  const webcamRef = useRef(null);
  const [mode, setMode] = useState("image"); // 'image' or 'signature'
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
    outputHeight
  ) => {
    const image = new window.Image();
    image.src = imageSrc;
    await new Promise((resolve) => (image.onload = resolve));

    const canvas = document.createElement("canvas");
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
      image,
      cropPixels.x,
      cropPixels.y,
      cropPixels.width,
      cropPixels.height,
      0,
      0,
      outputWidth,
      outputHeight
    );
    return canvas.toDataURL("image/jpeg");
  };

  const handleCropConfirm = async () => {
    const widthPx = cmToPx(mode === "image" ? 3.5 : 3.5);
    const heightPx = cmToPx(mode === "image" ? 4.5 : 1.5);
    const croppedImg = await getCroppedImg(
      tempImage,
      croppedAreaPixels,
      widthPx,
      heightPx
    );
    setShowCropper(false);
    setTempImage(null);
    if (mode === "image") {
      setImageSrc(croppedImg);
      setResizedImage(null);
      setImageError("");
    } else {
      setSignatureSrc(croppedImg);
      setResizedSignature(null);
      setSignatureError("");
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
      img.src = src;
      await new Promise((resolve) => (img.onload = resolve));

      const canvas = document.createElement("canvas");
      const width = cmToPx(dimensions.width);
      const height = cmToPx(dimensions.height);
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      let quality = 0.9;
      let blob = await new Promise((res) =>
        canvas.toBlob(res, "image/jpeg", quality)
      );
      let tries = 0;

      while (
        (blob.size > dimensions.maxSize || blob.size < 10 * 1024) &&
        tries < 20
      ) {
        quality += blob.size < 10 * 1024 ? 0.05 : -0.05;
        quality = Math.min(1, Math.max(0.1, quality));
        blob = await new Promise((res) =>
          canvas.toBlob(res, "image/jpeg", quality)
        );
        tries++;
      }

      if (blob.size > dimensions.maxSize || blob.size < 10 * 1024) {
        setError(
          `Final image size: ${Math.round(
            blob.size / 1024
          )}KB. Not within limit.`
        );
        setResized(null);
      } else {
        setResized(URL.createObjectURL(blob));
      }
    } catch (e) {
      setError("Image processing failed.");
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
      saveAs(resizedImage, "photo.jpg");
    } else if (mode === "signature" && resizedSignature) {
      saveAs(resizedSignature, "signature.jpg");
    }
  };

  return (
    <div className="main-container">
      {showCropper && (
        <div className="cropper-modal">
          <div className="cropper-container">
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
              <button onClick={handleCropConfirm}>Crop Done</button>
              <button onClick={handleCropCancel}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <h1>ID Photo & Signature Maker</h1>

      <div className="mode-switch">
        <button
          className={mode === "image" ? "active" : ""}
          onClick={() => setMode("image")}
        >
          Photo (3.5 x 4.5 cm)
        </button>
        <button
          className={mode === "signature" ? "active" : ""}
          onClick={() => setMode("signature")}
        >
          Signature (3.5 x 1.5 cm)
        </button>
      </div>

      <div className="webcam-container">
        <Webcam
          audio={false}
          ref={webcamRef}
          screenshotFormat="image/jpeg"
          width={320}
          height={240}
          videoConstraints={{ facingMode }}
        />
        <div className="webcam-actions">
          <button onClick={capture}>Capture</button>
          <button onClick={handleSwitchCamera}>Switch Camera</button>
          <label>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              hidden
            />
            Upload from Device
          </label>
        </div>
      </div>

      <div className="preview-section">
        <div className="preview-block">
          <h3>Original</h3>
          {mode === "image" && imageSrc && (
            <img src={imageSrc} alt="Ph" className="preview-img" />
          )}
          {mode === "signature" && signatureSrc && (
            <img src={signatureSrc} alt="Signature" className="preview-img" />
          )}
        </div>
        <div className="preview-block">
          <h3>Resized</h3>
          {mode === "image" && resizedImage && (
            <img src={resizedImage} alt="Resized" className="preview-img" />
          )}
          {mode === "signature" && resizedSignature && (
            <img
              src={resizedSignature}
              alt="Resized Signature"
              className="preview-img"
            />
          )}
          {imageError && mode === "image" && (
            <p className="error-msg">{imageError}</p>
          )}
          {signatureError && mode === "signature" && (
            <p className="error-msg">{signatureError}</p>
          )}
        </div>
      </div>

      <div className="action-buttons">
        <button
          onClick={handleResize}
          disabled={loading || (!imageSrc && !signatureSrc)}
        >
          {loading ? "Processing..." : "Resize & Compress"}
        </button>
        <button
          onClick={handleDownload}
          disabled={loading || (!resizedImage && !resizedSignature)}
        >
          Download JPG
        </button>
      </div>

      <footer>
        <p>Created to meet strict exam photo & signature upload requirements</p>
      </footer>
    </div>
  );
}

export default App;
