import React, { useRef, useState } from 'react';
import Webcam from 'react-webcam';
import imageCompression from 'browser-image-compression';
import { saveAs } from 'file-saver';
import Cropper from 'react-easy-crop';
import './App.css';

const CM_TO_PX = 118.11; // 1 cm ≈ 118.11 px at 300 DPI

const IMAGE_DIMENSIONS = { width: 3.5, height: 4.5, maxSize: 50 * 1024 }; // cm, bytes
const SIGNATURE_DIMENSIONS = { width: 3.5, height: 1.5, maxSize: 20 * 1024 }; // cm, bytes

function cmToPx(cm) {
  return Math.round(cm * CM_TO_PX);
}

function App() {
  const webcamRef = useRef(null);
  const [imageSrc, setImageSrc] = useState(null);
  const [signatureSrc, setSignatureSrc] = useState(null);
  const [resizedImage, setResizedImage] = useState(null);
  const [resizedSignature, setResizedSignature] = useState(null);
  const [imageError, setImageError] = useState('');
  const [signatureError, setSignatureError] = useState('');
  const [mode, setMode] = useState('image'); // 'image' or 'signature'
  const [loading, setLoading] = useState(false);
  const [facingMode, setFacingMode] = useState('user'); // 'user' (front) or 'environment' (back)

  // Cropper states
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [showCropper, setShowCropper] = useState(false);
  const [tempImage, setTempImage] = useState(null);

  // Show cropper after capture/upload
  const handleAfterCaptureOrUpload = (src) => {
    setTempImage(src);
    setShowCropper(true);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  };

  // Webcam capture
  const capture = () => {
    const imageSrc = webcamRef.current.getScreenshot();
    handleAfterCaptureOrUpload(imageSrc);
  };

  // Camera switch
  const handleSwitchCamera = () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  // File upload
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      handleAfterCaptureOrUpload(event.target.result);
    };
    reader.readAsDataURL(file);
  };

  // Cropper callbacks
  const onCropComplete = (croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  };

  // Get cropped image
  const getCroppedImg = async (imageSrc, cropPixels) => {
    const image = new window.Image();
    image.src = imageSrc;
    await new Promise((resolve) => (image.onload = resolve));
    const canvas = document.createElement('canvas');
    canvas.width = cropPixels.width;
    canvas.height = cropPixels.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(
      image,
      cropPixels.x,
      cropPixels.y,
      cropPixels.width,
      cropPixels.height,
      0,
      0,
      cropPixels.width,
      cropPixels.height
    );
    return canvas.toDataURL('image/jpeg');
  };

  // Confirm crop
  const handleCropConfirm = async () => {
    const croppedImg = await getCroppedImg(tempImage, croppedAreaPixels);
    setShowCropper(false);
    setTempImage(null);
    if (mode === 'image') {
      setImageSrc(croppedImg);
      setResizedImage(null);
      setImageError('');
    } else {
      setSignatureSrc(croppedImg);
      setResizedSignature(null);
      setSignatureError('');
    }
  };

  // Cancel crop
  const handleCropCancel = () => {
    setShowCropper(false);
    setTempImage(null);
  };

  // Auto crop (simple bounding box of non-white pixels)
  const autoCropImage = async (imageSrc) => {
    const image = new window.Image();
    image.src = imageSrc;
    await new Promise((resolve) => (image.onload = resolve));
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        const [r, g, b, a] = [
          imageData.data[i],
          imageData.data[i + 1],
          imageData.data[i + 2],
          imageData.data[i + 3]
        ];
        // If not white and not transparent
        if (!(r > 240 && g > 240 && b > 240) && a > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    // Add a small margin
    minX = Math.max(minX - 5, 0);
    minY = Math.max(minY - 5, 0);
    maxX = Math.min(maxX + 5, canvas.width);
    maxY = Math.min(maxY + 5, canvas.height);

    const cropWidth = maxX - minX;
    const cropHeight = maxY - minY;
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = cropWidth;
    cropCanvas.height = cropHeight;
    const cropCtx = cropCanvas.getContext('2d');
    cropCtx.drawImage(canvas, minX, minY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    return cropCanvas.toDataURL('image/jpeg');
  };

  // Handle auto crop
  const handleAutoCrop = async () => {
    if (!tempImage) return;
    const croppedImg = await autoCropImage(tempImage);
    setShowCropper(false);
    setTempImage(null);
    if (mode === 'image') {
      setImageSrc(croppedImg);
      setResizedImage(null);
      setImageError('');
    } else {
      setSignatureSrc(croppedImg);
      setResizedSignature(null);
      setSignatureError('');
    }
  };

  // Resize and compress
  const resizeAndCompress = async (src, dimensions, setResized, setError) => {
    setLoading(true);
    setError('');
    try {
      const img = new window.Image();
      img.src = src;
      await new Promise((resolve) => (img.onload = resolve));
      const canvas = document.createElement('canvas');
      canvas.width = cmToPx(dimensions.width);
      canvas.height = cmToPx(dimensions.height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.95)
      );
      let compressedBlob = await imageCompression(blob, {
        maxSizeMB: dimensions.maxSize / 1024 / 1024,
        maxWidthOrHeight: Math.max(canvas.width, canvas.height),
        useWebWorker: true,
        initialQuality: 0.9,
      });
      if (compressedBlob.size > dimensions.maxSize) {
        // Try further compression
        compressedBlob = await imageCompression(compressedBlob, {
          maxSizeMB: dimensions.maxSize / 1024 / 1024,
          maxWidthOrHeight: Math.max(canvas.width, canvas.height),
          useWebWorker: true,
          initialQuality: 0.7,
        });
      }
      if (compressedBlob.size > dimensions.maxSize) {
        setError(
          `Unable to compress below ${Math.round(dimensions.maxSize / 1024)}KB. Current: ${Math.round(
            compressedBlob.size / 1024
          )}KB`
        );
        setResized(null);
      } else {
        setResized(URL.createObjectURL(compressedBlob));
      }
    } catch (e) {
      setError('Error processing image.');
      setResized(null);
    }
    setLoading(false);
  };

  const handleResize = () => {
    if (mode === 'image' && imageSrc) {
      resizeAndCompress(imageSrc, IMAGE_DIMENSIONS, setResizedImage, setImageError);
    } else if (mode === 'signature' && signatureSrc) {
      resizeAndCompress(signatureSrc, SIGNATURE_DIMENSIONS, setResizedSignature, setSignatureError);
    }
  };

  const handleDownload = () => {
    if (mode === 'image' && resizedImage) {
      saveAs(resizedImage, 'photo.jpg');
    } else if (mode === 'signature' && resizedSignature) {
      saveAs(resizedSignature, 'signature.jpg');
    }
  };

  return (
    <div className="main-container">
      {showCropper && (
        <div className="cropper-modal">
          <div className="cropper-container">
            <Cropper
              image={tempImage}
              crop={crop}
              zoom={zoom}
              aspect={mode === 'image' ? 3.5 / 4.5 : 3.5 / 1.5}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
            <div className="cropper-actions">
              <button onClick={handleCropConfirm}>Crop</button>
              <button onClick={handleCropCancel}>Cancel</button>
              <button onClick={handleAutoCrop}>Auto Crop</button>
            </div>
          </div>
        </div>
      )}
      <h1>Image & Signature Resizer</h1>
      <div className="mode-switch">
        <button
          className={mode === 'image' ? 'active' : ''}
          onClick={() => setMode('image')}
        >
          Photo (3.5 x 4.5 cm, ≤50KB)
        </button>
        <button
          className={mode === 'signature' ? 'active' : ''}
          onClick={() => setMode('signature')}
        >
          Signature (3.5 x 1.5 cm, ≤20KB)
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
          <button className="capture-btn" onClick={capture} disabled={loading}>
            Capture {mode === 'image' ? 'Photo' : 'Signature'}
          </button>
          <button className="switch-btn" onClick={handleSwitchCamera} type="button">
            Switch Camera
          </button>
          <label className="upload-label">
            <input
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
            Upload from Device
          </label>
        </div>
      </div>
      <div className="preview-section">
        <div className="preview-block">
          <h3>Original {mode === 'image' ? 'Photo' : 'Signature'}</h3>
          {mode === 'image' && imageSrc && <img src={imageSrc} alt="Captured" className="preview-img" />}
          {mode === 'signature' && signatureSrc && <img src={signatureSrc} alt="Signature" className="preview-img" />}
        </div>
        <div className="preview-block">
          <h3>Resized & Compressed</h3>
          {mode === 'image' && resizedImage && <img src={resizedImage} alt="Resized" className="preview-img" />}
          {mode === 'signature' && resizedSignature && <img src={resizedSignature} alt="Resized Signature" className="preview-img" />}
          {(imageError && mode === 'image') && <div className="error-msg">{imageError}</div>}
          {(signatureError && mode === 'signature') && <div className="error-msg">{signatureError}</div>}
        </div>
      </div>
      <div className="action-buttons">
        <button onClick={handleResize} disabled={loading || (mode === 'image' ? !imageSrc : !signatureSrc)}>
          {loading ? 'Processing...' : 'Resize & Compress'}
        </button>
        <button
          onClick={handleDownload}
          disabled={loading || (mode === 'image' ? !resizedImage : !resizedSignature)}
        >
          Download JPG
        </button>
      </div>
      <footer>
        <p>Made with ❤️ for easy image & signature resizing</p>
      </footer>
    </div>
  );
}

export default App;
