import React, { useRef, useState } from 'react';
import Webcam from 'react-webcam';
import imageCompression from 'browser-image-compression';
import { saveAs } from 'file-saver';
import Cropper from 'react-easy-crop';
import './App.css';
import piexif from "piexifjs";

// const CM_TO_PX = 37.8; // 96 DPI
const CM_TO_PX = 118.11; // 1 cm ≈ 118.11 px at 300 DPI (print standard)

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

      let quality = 0.92; // Start with high quality
      let blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', quality)
      );

      // Try to get the image between 20KB and 50KB
      let minSize = 20 * 1024;
      let maxSize = dimensions.maxSize;
      let step = 0.02;
      let maxTries = 20;
      let tries = 0;

      // If too big, decrease quality
      while (blob.size > maxSize && quality > 0.1 && tries < maxTries) {
        quality -= step;
        blob = await new Promise((resolve) =>
          canvas.toBlob(resolve, 'image/jpeg', quality)
        );
        tries++;
      }

      // If too small, increase quality
      while (blob.size < minSize && quality < 0.99 && tries < maxTries) {
        quality += step;
        if (quality > 1) quality = 1;
        blob = await new Promise((resolve) =>
          canvas.toBlob(resolve, 'image/jpeg', quality)
        );
        tries++;
        if (blob.size >= minSize || quality === 1) break;
      }

      // Convert blob to data URL
      const jpegDataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });

      // Inject 300 DPI metadata using piexifjs
      const dpi = 300;
      let zeroth = {};
      zeroth[piexif.ImageIFD.XResolution] = [dpi, 1];
      zeroth[piexif.ImageIFD.YResolution] = [dpi, 1];
      zeroth[piexif.ImageIFD.ResolutionUnit] = 2; // inches

      let exifObj = { "0th": zeroth };
      let exifBytes = piexif.dump(exifObj);
      let newDataUrl = piexif.insert(exifBytes, jpegDataUrl);

      // Convert newDataUrl to blob for download
      function dataURLtoBlob(dataurl) {
        var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
          bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        return new Blob([u8arr], { type: mime });
      }

      const finalBlob = dataURLtoBlob(newDataUrl);

      if (finalBlob.size < minSize || finalBlob.size > maxSize) {
        setError(
          `Unable to get image between 20KB and 50KB. Final size: ${Math.round(
            finalBlob.size / 1024
          )}KB`
        );
        setResized(null);
      } else {
        setResized(URL.createObjectURL(finalBlob));
      }
    } catch (e) {
      setError('Error processing image.');
      setResized(null);
    }
    setLoading(false);
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Image Cropper and Resizer</h1>
        <p>Upload an image or take a photo to crop and resize.</p>

        <div className="mode-selector">
          <button onClick={() => setMode('image')} className={mode === 'image' ? 'active' : ''}>
            Image Mode
          </button>
          <button onClick={() => setMode('signature')} className={mode === 'signature' ? 'active' : ''}>
            Signature Mode
          </button>
        </div>

        <div className="upload-section">
          <input type="file" accept="image/*" onChange={handleFileUpload} />
          <button onClick={capture} disabled={loading}>
            {loading ? 'Capturing...' : 'Take Photo'}
          </button>
        </div>

        {imageSrc && (
          <div className="image-preview">
            <h2>Preview</h2>
            <img src={imageSrc} alt="Preview" />
            <button onClick={handleAutoCrop} disabled={loading}>
              Auto Crop
            </button>
            <button onClick={handleCropConfirm} disabled={loading}>
              Confirm Crop
            </button>
            <button onClick={handleCropCancel} disabled={loading}>
              Cancel Crop
            </button>
          </div>
        )}

        {signatureSrc && (
          <div className="image-preview">
            <h2>Preview</h2>
            <img src={signatureSrc} alt="Preview" />
            <button onClick={handleAutoCrop} disabled={loading}>
              Auto Crop
            </button>
            <button onClick={handleCropConfirm} disabled={loading}>
              Confirm Crop
            </button>
            <button onClick={handleCropCancel} disabled={loading}>
              Cancel Crop
            </button>
          </div>
        )}

        {showCropper && tempImage && (
          <Cropper
            image={tempImage}
            crop={crop}
            zoom={zoom}
            aspect={1} // Square crop
            onCropChange={setCrop}
            onCropComplete={onCropComplete}
            onZoomChange={setZoom}
          />
        )}

        {imageError && <p style={{ color: 'red' }}>{imageError}</p>}
        {signatureError && <p style={{ color: 'red' }}>{signatureError}</p>}

        <div className="image-actions">
          {imageSrc && (
            <button onClick={() => resizeAndCompress(imageSrc, IMAGE_DIMENSIONS, setResizedImage, setImageError)} disabled={loading}>
              Resize Image
            </button>
          )}
          {signatureSrc && (
            <button onClick={() => resizeAndCompress(signatureSrc, SIGNATURE_DIMENSIONS, setResizedSignature, setSignatureError)} disabled={loading}>
              Resize Signature
            </button>
          )}
        </div>

        {resizedImage && (
          <div className="image-preview">
            <h2>Resized Image</h2>
            <img src={resizedImage} alt="Resized" />
            <a href={resizedImage} download="cropped_image.jpg">Download</a>
          </div>
        )}

        {resizedSignature && (
          <div className="image-preview">
            <h2>Resized Signature</h2>
            <img src={resizedSignature} alt="Resized" />
            <a href={resizedSignature} download="cropped_signature.jpg">Download</a>
          </div>
        )}
      </header>
    </div>
  );
}

export default App;
   