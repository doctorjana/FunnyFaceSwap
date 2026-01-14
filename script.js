const videoInput = document.getElementById('videoInput');
const imageInput = document.getElementById('imageInput');
const targetImageInput = document.getElementById('targetImageInput');
const mainCanvas = document.getElementById('mainCanvas');
const ctx = mainCanvas.getContext('2d');
const sourceVideo = document.getElementById('sourceVideo');
const faceImage = document.getElementById('faceImage');
const placeholder = document.getElementById('placeholder');
const debugModeCheckbox = document.getElementById('debugMode');
const stableModeCheckbox = document.getElementById('stableMode');
const showTrianglesCheckbox = document.getElementById('showTriangles');
const enableSwapCheckbox = document.getElementById('enableSwap');
const warpFaceBtn = document.getElementById('warpFaceBtn');
const playPauseBtn = document.getElementById('playPauseBtn');
const seekSlider = document.getElementById('seekSlider');
const timeDisplay = document.getElementById('timeDisplay');
const edgeFeatherSlider = document.getElementById('edgeFeather');
const edgeFeatherVal = document.getElementById('edgeFeatherVal');
const falloffSlider = document.getElementById('falloffSlider');
const falloffVal = document.getElementById('falloffVal');

// Offscreen canvas for warping before blending
let warpCanvas = null;
let warpCtx = null;

// Hidden target image element
const targetImage = document.createElement('img');
targetImage.style.display = 'none';
document.body.appendChild(targetImage);

// State
let renderLoopId;
let lastVideoTime = -1;
let videoLandmarks = null;
let imageLandmarks = null;
let targetLandmarks = null;
let targetCache = null;

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

            // Initialize video controls
            seekSlider.max = sourceVideo.duration;
            updateTimeDisplay();

            sourceVideo.play()
                .then(() => {
                    playPauseBtn.querySelector('.play-icon').textContent = '⏸️';
                    startRenderingLoop();
                })
                .catch(err => {
                    console.error("Video play failed:", err);
                });
        };
    }
});

// Video Controls Logic
playPauseBtn.addEventListener('click', () => {
    if (sourceVideo.paused) {
        sourceVideo.play();
        playPauseBtn.querySelector('.play-icon').textContent = '⏸️';
    } else {
        sourceVideo.pause();
        playPauseBtn.querySelector('.play-icon').textContent = '▶️';
    }
});

seekSlider.addEventListener('input', () => {
    sourceVideo.currentTime = seekSlider.value;
    updateTimeDisplay();
    // If paused, trigger a single frame draw to show the seek result
    if (sourceVideo.paused) {
        drawFrame();
    }
});

function formatTime(seconds) {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function updateTimeDisplay() {
    timeDisplay.textContent = `${formatTime(sourceVideo.currentTime)} / ${formatTime(sourceVideo.duration)}`;
}

// Edge feather slider listener
edgeFeatherSlider.addEventListener('input', () => {
    edgeFeatherVal.textContent = `${edgeFeatherSlider.value}px`;
});

// Falloff slider listener
falloffSlider.addEventListener('input', () => {
    falloffVal.textContent = `${falloffSlider.value}%`;
});

// Handle Image Upload (Source Face)
imageInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        const url = URL.createObjectURL(file);
        faceImage.src = url;
        faceImage.onload = async () => {
            updateLabel('imageInput', file.name);

            // Clear previous cache
            if (window.PhotoProcessor) {
                window.PhotoProcessor.clearCache();
            }

            // Detect landmarks on the face image
            if (window.FaceLandmarkerModule && window.FaceLandmarkerModule.isReady()) {
                imageLandmarks = await window.FaceLandmarkerModule.detectImage(faceImage);
                if (imageLandmarks && imageLandmarks.length > 0) {
                    console.log(`Detected ${imageLandmarks[0].length} landmarks on source face`);

                    // Preprocess the photo: extract stable landmarks, compute bounding box, triangulate
                    if (window.PhotoProcessor) {
                        const cache = window.PhotoProcessor.preprocess(
                            imageLandmarks[0],
                            faceImage.naturalWidth,
                            faceImage.naturalHeight
                        );
                        if (cache) {
                            console.log("Source photo preprocessed and cached successfully");
                        }
                    }
                } else {
                    console.log("No face detected in source image");
                    imageLandmarks = null;
                }

                updateWarpButtonState();

                // Trigger a canvas redraw if video is not playing
                if (!sourceVideo.src || sourceVideo.paused) {
                    redrawCanvas();
                }
            }
        };
    }
});

// Handle Target Image Upload
targetImageInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        const url = URL.createObjectURL(file);
        targetImage.src = url;
        targetImage.onload = async () => {
            updateLabel('targetImageInput', file.name);

            // Detect landmarks on the target image
            if (window.FaceLandmarkerModule && window.FaceLandmarkerModule.isReady()) {
                targetLandmarks = await window.FaceLandmarkerModule.detectImage(targetImage);
                if (targetLandmarks && targetLandmarks.length > 0) {
                    console.log(`Detected ${targetLandmarks[0].length} landmarks on target face`);

                    // Get stable landmarks for target
                    const stableTargetLandmarks = window.FaceLandmarkerModule.getStableLandmarks(targetLandmarks[0]);

                    // Convert to pixel coordinates
                    targetCache = {
                        landmarks: stableTargetLandmarks,
                        pixelLandmarks: stableTargetLandmarks.map(lm => ({
                            x: lm.x * targetImage.naturalWidth,
                            y: lm.y * targetImage.naturalHeight
                        })),
                        width: targetImage.naturalWidth,
                        height: targetImage.naturalHeight
                    };
                    console.log(`Target: ${targetCache.pixelLandmarks.length} stable landmarks`);
                } else {
                    console.log("No face detected in target image");
                    targetLandmarks = null;
                    targetCache = null;
                }

                updateWarpButtonState();

                // Show the target image on canvas
                mainCanvas.width = targetImage.naturalWidth;
                mainCanvas.height = targetImage.naturalHeight;
                placeholder.style.display = 'none';
                ctx.drawImage(targetImage, 0, 0);
            }
        };
    }
});

// Update warp button enabled state
function updateWarpButtonState() {
    const sourceReady = window.PhotoProcessor && window.PhotoProcessor.isProcessed();
    const targetReady = targetCache && targetCache.pixelLandmarks;
    warpFaceBtn.disabled = !(sourceReady && targetReady);
}

// Handle Warp Face button click
warpFaceBtn.addEventListener('click', () => {
    performFaceWarp();
});

// Perform the face warping
function performFaceWarp() {
    if (!window.FaceWarper || !window.PhotoProcessor) {
        console.warn("FaceWarper or PhotoProcessor not loaded");
        return;
    }

    const srcCache = window.PhotoProcessor.getCache();
    if (!srcCache || !targetCache) {
        console.warn("Source or target not ready for warping");
        return;
    }

    console.log("Starting face warp...");
    console.log(`Source landmarks: ${srcCache.pixelLandmarks.length}`);
    console.log(`Target landmarks: ${targetCache.pixelLandmarks.length}`);
    console.log(`Triangles: ${srcCache.triangles.length}`);

    // Set canvas to target size
    mainCanvas.width = targetCache.width;
    mainCanvas.height = targetCache.height;

    // Draw target image as background
    ctx.drawImage(targetImage, 0, 0);

    // Perform the face warp
    window.FaceWarper.warpFace(
        ctx,
        faceImage,
        srcCache.pixelLandmarks,
        targetCache.pixelLandmarks,
        srcCache.triangles
    );

    console.log("Face warp complete!");

    // Draw debug overlays if enabled
    if (showTrianglesCheckbox.checked) {
        window.PhotoProcessor.drawTriangleMesh(
            ctx,
            targetCache.pixelLandmarks,
            srcCache.triangles,
            1, 1,
            "#00FFFF"
        );
    }
}

// Handle debug mode toggle - redraw canvas to show/hide landmarks
debugModeCheckbox.addEventListener('change', () => {
    console.log('Debug mode:', debugModeCheckbox.checked ? 'enabled' : 'disabled');
    // If video isn't playing, manually redraw the canvas
    if (!sourceVideo.src || sourceVideo.paused) {
        redrawCanvas();
    }
});

// Handle stable mode toggle - redraw canvas to show filtered landmarks
stableModeCheckbox.addEventListener('change', () => {
    console.log('Stable mode:', stableModeCheckbox.checked ? 'enabled' : 'disabled');
    // If video isn't playing, manually redraw the canvas
    if (!sourceVideo.src || sourceVideo.paused) {
        redrawCanvas();
    }
});

// Handle show triangles toggle - redraw canvas to show/hide triangle mesh
showTrianglesCheckbox.addEventListener('change', () => {
    console.log('Show triangles:', showTrianglesCheckbox.checked ? 'enabled' : 'disabled');
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
                let landmarksToDraw = imageLandmarks[0];
                if (stableModeCheckbox.checked) {
                    landmarksToDraw = window.FaceLandmarkerModule.getStableLandmarks(landmarksToDraw);
                }
                window.FaceLandmarkerModule.drawLandmarks(ctx, landmarksToDraw, imgW, imgH, "#FF00FF");
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
            let landmarksToDraw = imageLandmarks[0];
            if (stableModeCheckbox.checked) {
                landmarksToDraw = window.FaceLandmarkerModule.getStableLandmarks(landmarksToDraw);
                window.FaceLandmarkerModule.drawLandmarks(ctx, landmarksToDraw, mainCanvas.width, mainCanvas.height, "#00FF00");
            } else {
                window.FaceLandmarkerModule.drawLandmarks(ctx, landmarksToDraw, mainCanvas.width, mainCanvas.height, "#00FF00");
                window.FaceLandmarkerModule.drawFaceMesh(ctx, landmarksToDraw, mainCanvas.width, mainCanvas.height, "rgba(0, 255, 0, 0.5)");
            }
        }

        // Draw triangle mesh if show triangles is enabled
        if (showTrianglesCheckbox.checked && window.PhotoProcessor && window.PhotoProcessor.isProcessed()) {
            const cache = window.PhotoProcessor.getCache();
            if (cache) {
                // Scale from original image size to canvas size
                const scaleX = mainCanvas.width / cache.imageWidth;
                const scaleY = mainCanvas.height / cache.imageHeight;
                window.PhotoProcessor.drawTriangleMesh(ctx, cache.pixelLandmarks, cache.triangles, scaleX, scaleY, "#FFFF00");
                window.PhotoProcessor.drawBoundingBox(ctx, cache.boundingBox, scaleX, scaleY, "#00FFFF");
            }
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

            // Sync UI controls with current playback time
            if (!seekSlider.matches(':active')) {
                seekSlider.value = sourceVideo.currentTime;
            }
            updateTimeDisplay();
        }
    }

    // Perform real-time face swap if enabled
    if (enableSwapCheckbox.checked &&
        window.FaceWarper &&
        window.PhotoProcessor &&
        window.PhotoProcessor.isProcessed() &&
        videoLandmarks &&
        videoLandmarks.length > 0) {

        const srcCache = window.PhotoProcessor.getCache();
        if (srcCache) {
            // Process each detected face in the video
            for (const faceLandmarks of videoLandmarks) {
                // Get stable landmarks from video face
                const stableVideoLandmarks = window.FaceLandmarkerModule.getStableLandmarks(faceLandmarks);

                if (stableVideoLandmarks.length === srcCache.pixelLandmarks.length) {
                    // Convert to pixel coordinates
                    const videoPixelLandmarks = stableVideoLandmarks.map(lm => ({
                        x: lm.x * mainCanvas.width,
                        y: lm.y * mainCanvas.height
                    }));

                    // Get edge feather setting
                    const edgeBlur = parseInt(edgeFeatherSlider.value) || 20;

                    // Check if feathering is enabled
                    const useFeathering = window.FaceBlender && edgeBlur > 0;

                    if (useFeathering) {
                        // Initialize offscreen canvas if needed
                        if (!warpCanvas || warpCanvas.width !== mainCanvas.width || warpCanvas.height !== mainCanvas.height) {
                            warpCanvas = document.createElement('canvas');
                            warpCanvas.width = mainCanvas.width;
                            warpCanvas.height = mainCanvas.height;
                            warpCtx = warpCanvas.getContext('2d');
                        }

                        // Clear and warp to offscreen canvas
                        warpCtx.clearRect(0, 0, warpCanvas.width, warpCanvas.height);
                        window.FaceWarper.warpFace(
                            warpCtx,
                            faceImage,
                            srcCache.pixelLandmarks,
                            videoPixelLandmarks,
                            srcCache.triangles
                        );

                        // Apply edge-feathered blending with falloff
                        const falloff = parseInt(falloffSlider.value) || 70;
                        window.FaceBlender.applyFeatheredBlend(
                            ctx,
                            warpCanvas,
                            videoPixelLandmarks,
                            edgeBlur,
                            falloff
                        );
                    } else {
                        // Direct warp without feathering
                        window.FaceWarper.warpFace(
                            ctx,
                            faceImage,
                            srcCache.pixelLandmarks,
                            videoPixelLandmarks,
                            srcCache.triangles
                        );
                    }

                    // Draw triangle mesh overlay if debug enabled
                    if (showTrianglesCheckbox.checked) {
                        window.PhotoProcessor.drawTriangleMesh(
                            ctx,
                            videoPixelLandmarks,
                            srcCache.triangles,
                            1, 1,
                            "#00FFFF"
                        );
                    }
                }
            }
        }
    }

    // Draw the face image in the corner if it exists (and swap not enabled)
    if (!enableSwapCheckbox.checked && faceImage.complete && faceImage.naturalHeight !== 0 && faceImage.src) {
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
            let landmarksToDraw = imageLandmarks[0];
            if (stableModeCheckbox.checked) {
                landmarksToDraw = window.FaceLandmarkerModule.getStableLandmarks(landmarksToDraw);
            }
            window.FaceLandmarkerModule.drawLandmarks(ctx, landmarksToDraw, imgW, imgH, "#FF00FF");
            ctx.restore();
        }
    }

    // Draw landmarks on video frame if debug mode is enabled (and swap not enabled)
    if (!enableSwapCheckbox.checked && debugModeCheckbox.checked && videoLandmarks && videoLandmarks.length > 0) {
        for (const faceLandmarks of videoLandmarks) {
            let landmarksToDraw = faceLandmarks;
            if (stableModeCheckbox.checked) {
                landmarksToDraw = window.FaceLandmarkerModule.getStableLandmarks(landmarksToDraw);
                window.FaceLandmarkerModule.drawLandmarks(ctx, landmarksToDraw, mainCanvas.width, mainCanvas.height, "#00FF00");
            } else {
                window.FaceLandmarkerModule.drawLandmarks(ctx, landmarksToDraw, mainCanvas.width, mainCanvas.height, "#00FF00");
                window.FaceLandmarkerModule.drawFaceMesh(ctx, landmarksToDraw, mainCanvas.width, mainCanvas.height, "rgba(0, 255, 0, 0.5)");
            }
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
