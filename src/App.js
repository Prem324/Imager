import React, { useRef, useState } from 'react';
import Webcam from 'react-webcam';
import imageCompression from 'browser-image-compression';
import { saveAs } from 'file-saver';
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

  const capture = () => {
    const imageSrc = webcamRef.current.getScreenshot();
    if (mode === 'image') {
      setImageSrc(imageSrc);
      setResizedImage(null);
      setImageError('');
    } else {
      setSignatureSrc(imageSrc);
      setResizedSignature(null);
      setSignatureError('');
    }
  };

  // Handle camera switch
  const handleSwitchCamera = () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  // Handle file upload
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (mode === 'image') {
        setImageSrc(event.target.result);
        setResizedImage(null);
        setImageError('');
      } else {
        setSignatureSrc(event.target.result);
        setResizedSignature(null);
        setSignatureError('');
      }
    };
    reader.readAsDataURL(file);
  };

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
