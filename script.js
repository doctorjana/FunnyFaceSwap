const videoInput = document.getElementById('videoInput');
const imageInput = document.getElementById('imageInput');
const mainCanvas = document.getElementById('mainCanvas');
const ctx = mainCanvas.getContext('2d');
const sourceVideo = document.getElementById('sourceVideo');
const faceImage = document.getElementById('faceImage');
const placeholder = document.getElementById('placeholder');
const debugModeCheckbox = document.getElementById('debugMode');

// State
let renderLoopId;
let lastVideoTime = -1;
let videoLandmarks = null;
let imageLandmarks = null;

// Helper to update label text
function updateLabel(inputId, filename) {
    const label = document.querySelector(`label[for="${inputId}"]`);
    const textSpan = label.querySelector('.text');
    const subTextSpan = label.querySelector('.sub-text');

    label.classList.add('active');
    textSpan.textContent = "Selected";
    subTextSpan.textContent = filename;
}

// Initialize Face Landmarker on page load
async function initApp() {
    console.log("Initializing application...");
    if (window.FaceLandmarkerModule) {
        const success = await window.FaceLandmarkerModule.init();
        if (success) {
            console.log("Face Landmarker ready!");
        } else {
            console.warn("Face Landmarker initialization failed. Landmark detection will be disabled.");
        }
    } else {
        console.warn("FaceLandmarkerModule not found.");
    }
}

// Handle Video Upload
videoInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const url = URL.createObjectURL(file);
        sourceVideo.src = url;
        updateLabel('videoInput', file.name);

        // When video metadata is loaded, resize canvas and start playback
        sourceVideo.onloadedmetadata = () => {
            mainCanvas.width = sourceVideo.videoWidth;
            mainCanvas.height = sourceVideo.videoHeight;
            placeholder.style.display = 'none';

            sourceVideo.play()
                .then(() => {
                    console.log("Video started playing");
                    startRenderingLoop();
                })
                .catch(err => {
                    console.error("Video play failed:", err);
                });
        };
    }
});

// Handle Image Upload
imageInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        const url = URL.createObjectURL(file);
        faceImage.src = url;
        faceImage.onload = async () => {
            updateLabel('imageInput', file.name);

            // Detect landmarks on the face image
            if (window.FaceLandmarkerModule && window.FaceLandmarkerModule.isReady()) {
                imageLandmarks = await window.FaceLandmarkerModule.detectImage(faceImage);
                if (imageLandmarks && imageLandmarks.length > 0) {
                    console.log(`Detected ${imageLandmarks[0].length} landmarks on face image`);
                } else {
                    console.log("No face detected in image");
                    imageLandmarks = null;
                }

                // Trigger a canvas redraw if video is not playing
                if (!sourceVideo.src || sourceVideo.paused) {
                    redrawCanvas();
                }
            }
        };
    }
});

// Handle debug mode toggle - redraw canvas to show/hide landmarks
debugModeCheckbox.addEventListener('change', () => {
    console.log('Debug mode:', debugModeCheckbox.checked ? 'enabled' : 'disabled');
    // If video isn't playing, manually redraw the canvas
    if (!sourceVideo.src || sourceVideo.paused) {
        redrawCanvas();
    }
});

// Manual canvas redraw for static content (when video isn't playing)
function redrawCanvas() {
    // Clear canvas or draw a placeholder
    if (!sourceVideo.src && (!faceImage.src || !faceImage.complete)) {
        return; // Nothing to draw
    }

    const canvasWidth = mainCanvas.width || 300;
    const canvasHeight = mainCanvas.height || 150;

    if (sourceVideo.src && sourceVideo.readyState >= 2) {
        // Draw current video frame
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        ctx.drawImage(sourceVideo, 0, 0, canvasWidth, canvasHeight);

        // Draw face image as small preview in corner when video is present
        if (faceImage.complete && faceImage.naturalHeight !== 0 && faceImage.src) {
            const size = Math.min(canvasWidth, canvasHeight) * 0.2;
            const ratio = faceImage.naturalWidth / faceImage.naturalHeight;
            const imgX = 10;
            const imgY = 10;
            const imgW = size * ratio;
            const imgH = size;
            ctx.drawImage(faceImage, imgX, imgY, imgW, imgH);

            // Draw landmarks on face image preview if debug mode is enabled
            if (debugModeCheckbox.checked && imageLandmarks && imageLandmarks.length > 0) {
                ctx.save();
                ctx.translate(imgX, imgY);
                window.FaceLandmarkerModule.drawLandmarks(ctx, imageLandmarks[0], imgW, imgH, "#FF00FF");
                ctx.restore();
            }
        }
    } else if (faceImage.complete && faceImage.naturalHeight !== 0 && faceImage.src) {
        // No video loaded - display face image full-size
        // Resize canvas to match image dimensions
        mainCanvas.width = faceImage.naturalWidth;
        mainCanvas.height = faceImage.naturalHeight;
        placeholder.style.display = 'none';

        // Draw the face image at full size
        ctx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
        ctx.drawImage(faceImage, 0, 0, mainCanvas.width, mainCanvas.height);

        // Draw landmarks on full-size image if debug mode is enabled
        if (debugModeCheckbox.checked && imageLandmarks && imageLandmarks.length > 0) {
            window.FaceLandmarkerModule.drawLandmarks(ctx, imageLandmarks[0], mainCanvas.width, mainCanvas.height, "#00FF00");
            window.FaceLandmarkerModule.drawFaceMesh(ctx, imageLandmarks[0], mainCanvas.width, mainCanvas.height, "rgba(0, 255, 0, 0.5)");
        }
    }
}

function drawFrame() {
    const timestamp = performance.now();

    // Draw video frame
    ctx.drawImage(sourceVideo, 0, 0, mainCanvas.width, mainCanvas.height);

    // Detect landmarks on video frame (only if time has changed)
    if (window.FaceLandmarkerModule && window.FaceLandmarkerModule.isReady()) {
        if (sourceVideo.currentTime !== lastVideoTime) {
            videoLandmarks = window.FaceLandmarkerModule.detectVideo(sourceVideo, timestamp);
            lastVideoTime = sourceVideo.currentTime;
        }
    }

    // Draw the face image in the corner if it exists
    if (faceImage.complete && faceImage.naturalHeight !== 0 && faceImage.src) {
        const size = Math.min(mainCanvas.width, mainCanvas.height) * 0.2;
        const ratio = faceImage.naturalWidth / faceImage.naturalHeight;
        const imgX = 10;
        const imgY = 10;
        const imgW = size * ratio;
        const imgH = size;
        ctx.drawImage(faceImage, imgX, imgY, imgW, imgH);

        // Draw landmarks on face image preview if debug mode is enabled
        if (debugModeCheckbox.checked && imageLandmarks && imageLandmarks.length > 0) {
            // Scale landmarks to the preview image size
            ctx.save();
            ctx.translate(imgX, imgY);
            window.FaceLandmarkerModule.drawLandmarks(ctx, imageLandmarks[0], imgW, imgH, "#FF00FF");
            ctx.restore();
        }
    }

    // Draw landmarks on video frame if debug mode is enabled
    if (debugModeCheckbox.checked && videoLandmarks && videoLandmarks.length > 0) {
        for (const faceLandmarks of videoLandmarks) {
            window.FaceLandmarkerModule.drawLandmarks(ctx, faceLandmarks, mainCanvas.width, mainCanvas.height, "#00FF00");
            window.FaceLandmarkerModule.drawFaceMesh(ctx, faceLandmarks, mainCanvas.width, mainCanvas.height, "rgba(0, 255, 0, 0.5)");
        }
    }
}

function startRenderingLoop() {
    // Cancel any existing loop to prevent duplicates
    if (renderLoopId) {
        if (sourceVideo.requestVideoFrameCallback) {
            sourceVideo.cancelVideoFrameCallback(renderLoopId);
        } else {
            cancelAnimationFrame(renderLoopId);
        }
    }

    if ('requestVideoFrameCallback' in sourceVideo) {
        console.log("Using requestVideoFrameCallback");
        function loop() {
            drawFrame();
            renderLoopId = sourceVideo.requestVideoFrameCallback(loop);
        }
        sourceVideo.requestVideoFrameCallback(loop);
    } else {
        console.log("Using requestAnimationFrame");
        function loop() {
            drawFrame();
            renderLoopId = requestAnimationFrame(loop);
        }
        requestAnimationFrame(loop);
    }
}

// Initialize the app
initApp();
