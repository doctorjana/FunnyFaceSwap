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
const enableSwapBtn = document.getElementById('enableSwapBtn');
const swapStatusEl = document.getElementById('swapStatus');
const warpFaceBtn = document.getElementById('warpFaceBtn');
const playPauseBtn = document.getElementById('playPauseBtn');
const seekSlider = document.getElementById('seekSlider');
const timeDisplay = document.getElementById('timeDisplay');
const edgeFeatherSlider = document.getElementById('edgeFeather');
const edgeFeatherVal = document.getElementById('edgeFeatherVal');
const falloffSlider = document.getElementById('falloffSlider');
const falloffVal = document.getElementById('falloffVal');
const brightnessSlider = document.getElementById('brightnessSlider');
const contrastSlider = document.getElementById('contrastSlider');
const brightnessVal = document.getElementById('brightnessVal');
const contrastVal = document.getElementById('contrastVal');
const autoMatchCheckbox = document.getElementById('autoMatchColor');
const exportBtn = document.getElementById('exportBtn');
const exportModal = document.getElementById('exportModal');
const exportProgress = document.getElementById('exportProgress');
const exportStatus = document.getElementById('exportStatus');
const cancelExportBtn = document.getElementById('cancelExportBtn');

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
let videoLandmarkCache = new Map(); // Cache for video landmarks per timestamp
let isExporting = false;
let exportCancelled = false;
let isSwapEnabled = false; // Track if face swap is active

// Helper to update asset list & viewport name
function registerAsset(inputId, filename) {
    const isVideo = inputId === 'videoInput';
    const listId = isVideo ? 'videoList' : 'photoList';
    const list = document.getElementById(listId);

    // Clear the "empty" hint if present
    const emptyHint = list.querySelector('.empty-hint');
    if (emptyHint) emptyHint.remove();

    // Add asset entry
    const entry = document.createElement('div');
    entry.className = 'asset-item active';
    entry.innerHTML = `
        <span class="asset-icon">${isVideo ? '🎥' : '👤'}</span>
        <span class="asset-name">${filename}</span>
    `;

    // Deactivate others
    list.querySelectorAll('.asset-item').forEach(item => item.classList.remove('active'));
    list.appendChild(entry);

    if (isVideo) {
        document.getElementById('currentVideoName').textContent = `Viewport - ${filename}`;
    }
}

// Initialize Face Landmarker and Tab logic
async function initApp() {
    console.log("Initializing application...");

    // Tab switching logic
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const target = tab.dataset.tab;
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(`${target}-tab`).classList.add('active');
        });
    });

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
        registerAsset('videoInput', file.name);

        // When video metadata is loaded, resize canvas and start playback
        sourceVideo.onloadedmetadata = () => {
            mainCanvas.width = sourceVideo.videoWidth;
            mainCanvas.height = sourceVideo.videoHeight;
            placeholder.style.display = 'none';

            // Initialize video controls
            seekSlider.max = sourceVideo.duration;
            updateTimeDisplay();

            // Clear video landmark cache when new video loaded
            videoLandmarkCache.clear();

            sourceVideo.play()
                .then(() => {
                    playPauseBtn.querySelector('.play-icon').textContent = '⏸️';
                    startRenderingLoop();
                    updateSwapButtonState();
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

// Color correction listeners
brightnessSlider.addEventListener('input', () => {
    brightnessVal.textContent = brightnessSlider.value;
});
contrastSlider.addEventListener('input', () => {
    contrastVal.textContent = contrastSlider.value;
});

// Helper: Wait for valid video data
function waitForVideoData(video) {
    return new Promise(resolve => {
        if (video.readyState >= 2) { // HAVE_CURRENT_DATA
            resolve();
        } else {
            const check = () => {
                if (video.readyState >= 2) {
                    video.removeEventListener('canplay', check);
                    resolve();
                }
            };
            video.addEventListener('canplay', check);
        }
    });
}


// Video Export Logic
let lastGoodLandmarks = null;

async function exportVideo() {
    if (isExporting || !sourceVideo.src || sourceVideo.duration === 0) return;

    isExporting = true;
    exportCancelled = false;
    lastGoodLandmarks = null; // Reset persistence

    // UI Feedback
    exportModal.classList.add('active');
    exportProgress.style.width = '0%';
    exportStatus.textContent = 'Preparing render...';

    // Pause normal playback
    sourceVideo.pause();
    if (renderLoopId) cancelAnimationFrame(renderLoopId);

    try {
        // Check for WebCodecs support
        const supportsWebCodecs = typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';

        if (supportsWebCodecs) {
            // -------------------------------------------------------------
            // METHOD 1: WebCodecs + WebMMuxer (True Offline Rendering)
            // -------------------------------------------------------------
            console.log("Using WebCodecs (True Offline Export)");

            // Import Muxer dynamically (MP4)
            const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");

            const fps = 30;
            const totalDuration = sourceVideo.duration;
            const totalFrames = Math.floor(totalDuration * fps);
            const frameTime = 1 / fps;

            // Setup Muxer (MP4)
            const muxer = new Muxer({
                target: new ArrayBufferTarget(),
                video: {
                    codec: 'avc',
                    width: mainCanvas.width,
                    height: mainCanvas.height
                },
                fastStart: 'in-memory'
            });

            // Setup VideoEncoder (H.264 / AVC)
            const encoder = new VideoEncoder({
                output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
                error: (e) => console.error("Encoder error:", e)
            });

            encoder.configure({
                codec: 'avc1.4d0033', // H.264 Main Profile Level 5.1 (Supports up to 4K)
                width: mainCanvas.width,
                height: mainCanvas.height,
                bitrate: 10_000_000,
                framerate: fps
            });

            // Frame Loop
            for (let i = 0; i <= totalFrames; i++) {
                if (exportCancelled) break;

                const currentTime = i * frameTime;
                sourceVideo.currentTime = Math.min(currentTime, totalDuration);

                // Wait for seek
                await new Promise(resolve => {
                    const onSeeked = () => {
                        sourceVideo.removeEventListener('seeked', onSeeked);
                        resolve();
                    };
                    sourceVideo.addEventListener('seeked', onSeeked);
                });

                // Wait for actual frame data to be ready
                await waitForVideoData(sourceVideo);

                // Process Frame (Landmarks + Swap)
                await processExportFrame();

                // Create VideoFrame from Canvas
                const frameDurationMicros = (1 / fps) * 1_000_000;
                const frame = new VideoFrame(mainCanvas, {
                    timestamp: i * frameDurationMicros, // microseconds
                    duration: frameDurationMicros
                });

                // Encode
                encoder.encode(frame, { keyFrame: i % 30 === 0 });
                frame.close();

                // Update UI
                const percent = (i / totalFrames) * 100;
                exportProgress.style.width = `${percent}%`;
                exportStatus.textContent = `Rendering frame ${i} / ${totalFrames}...`;
            }

            // Finish
            await encoder.flush();
            muxer.finalize();
            const buffer = muxer.target.buffer;

            if (!exportCancelled) {
                const blob = new Blob([buffer], { type: 'video/mp4' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `FaceSwap_Export_${Date.now()}.mp4`;
                a.click();
            }

            exportModal.classList.remove('active');
            isExporting = false;
            startRenderingLoop();

        } else {
            // -------------------------------------------------------------
            // METHOD 2: Real-time MediaRecorder Fallback
            // -------------------------------------------------------------
            console.log("Using MediaRecorder Fallback (Real-Time)");

            const stream = mainCanvas.captureStream(30);
            const mimeType = 'video/webm;codecs=vp8'; // Safer fallback

            const recorder = new MediaRecorder(stream, {
                mimeType: MediaRecorder.isTypeSupported(mimeType) ? mimeType : 'video/webm',
                bitsPerSecond: 5000000
            });

            const chunks = [];
            recorder.ondataavailable = e => chunks.push(e.data);

            recorder.onstop = () => {
                if (exportCancelled) return;
                const blob = new Blob(chunks, { type: recorder.mimeType });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `FaceSwap_Export_${Date.now()}.webm`;
                a.click();

                exportModal.classList.remove('active');
                isExporting = false;
                startRenderingLoop();
            };

            sourceVideo.currentTime = 0;
            startRenderingLoop();
            sourceVideo.play();
            recorder.start();

            const checkEnd = setInterval(() => {
                const percent = (sourceVideo.currentTime / sourceVideo.duration) * 100;
                exportProgress.style.width = `${percent}%`;
                exportStatus.textContent = `Recording... ${Math.round(percent)}%`;

                if (sourceVideo.ended || sourceVideo.currentTime >= sourceVideo.duration || exportCancelled) {
                    clearInterval(checkEnd);
                    recorder.stop();
                    sourceVideo.pause();
                    cancelAnimationFrame(renderLoopId);
                }
            }, 100);
        }

    } catch (err) {
        console.error("Export failed:", err);
        alert("Export failed: " + err.message);
        exportModal.classList.remove('active');
        isExporting = false;
        startRenderingLoop();
    }
}

async function processExportFrame() {
    // Draw the current video frame to the canvas
    ctx.drawImage(sourceVideo, 0, 0, mainCanvas.width, mainCanvas.height);

    // Use a timestamp based on video time
    const timestamp = sourceVideo.currentTime * 1000;

    // Check cache or detect
    let currentLandmarks = null;
    const timeKey = Math.floor(sourceVideo.currentTime * 1000);

    if (videoLandmarkCache.has(timeKey)) {
        currentLandmarks = videoLandmarkCache.get(timeKey);
    } else if (window.FaceLandmarkerModule && window.FaceLandmarkerModule.isReady()) {
        // "Image Mode" for Export: Detect on specific pixels (accurate but slower)
        // We pass mainCanvas because we just drew the video frame onto it
        for (let attempt = 0; attempt < 3; attempt++) {
            currentLandmarks = await window.FaceLandmarkerModule.detectImage(mainCanvas);
            if (currentLandmarks && currentLandmarks.length > 0) {
                videoLandmarkCache.set(timeKey, currentLandmarks);
                break; // Found it!
            }
            // Wait a bit before retry
            if (attempt < 2) await new Promise(r => setTimeout(r, 50));
        }
    }

    // Persistence Logic: Use last known good landmarks if current detection fails
    if (currentLandmarks && currentLandmarks.length > 0) {
        lastGoodLandmarks = currentLandmarks;
    } else if (lastGoodLandmarks) {
        // console.log("Using persistent landmarks for frame at", timestamp);
        currentLandmarks = lastGoodLandmarks;
    }

    // Apply swap if possible
    if (isSwapEnabled && currentLandmarks && currentLandmarks.length > 0) {
        const srcCache = window.PhotoProcessor.getCache();
        if (srcCache) {
            for (const faceLandmarks of currentLandmarks) {
                const stableVideoLandmarks = window.FaceLandmarkerModule.getStableLandmarks(faceLandmarks);
                if (stableVideoLandmarks.length === srcCache.pixelLandmarks.length) {
                    const videoPixelLandmarks = stableVideoLandmarks.map(lm => ({
                        x: lm.x * mainCanvas.width,
                        y: lm.y * mainCanvas.height
                    }));

                    // Prepare warp canvas
                    if (!warpCanvas || warpCanvas.width !== mainCanvas.width || warpCanvas.height !== mainCanvas.height) {
                        warpCanvas = document.createElement('canvas');
                        warpCanvas.width = mainCanvas.width;
                        warpCanvas.height = mainCanvas.height;
                        warpCtx = warpCanvas.getContext('2d');
                    }
                    warpCtx.clearRect(0, 0, warpCanvas.width, warpCanvas.height);

                    // Warp
                    window.FaceWarper.warpFace(warpCtx, faceImage, srcCache.pixelLandmarks, videoPixelLandmarks, srcCache.triangles);

                    // Color Match
                    if (autoMatchCheckbox.checked) {
                        const sourceStats = window.FaceBlender.getColorStats(warpCtx, videoPixelLandmarks, warpCanvas.width, warpCanvas.height);
                        const targetStats = window.FaceBlender.getColorStats(ctx, videoPixelLandmarks, mainCanvas.width, mainCanvas.height);
                        if (sourceStats && targetStats) {
                            window.FaceBlender.matchColorStats(warpCtx, warpCanvas.width, warpCanvas.height, sourceStats, targetStats);
                        }
                    }

                    // Manual Adjust
                    const b = parseInt(brightnessSlider.value) || 0;
                    const c = parseInt(contrastSlider.value) || 0;
                    if (b !== 0 || c !== 0) window.FaceBlender.adjustColor(warpCtx, warpCanvas.width, warpCanvas.height, b, c);

                    // Blend
                    const edgeBlur = parseInt(edgeFeatherSlider.value) || 20;
                    const falloff = parseInt(falloffSlider.value) || 70;
                    window.FaceBlender.applyFeatheredBlend(ctx, warpCanvas, videoPixelLandmarks, edgeBlur, falloff);
                }
            }
        }
    }

    // Give the browser a moment to finalize the draw
    return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

exportBtn.addEventListener('click', exportVideo);

cancelExportBtn.addEventListener('click', () => {
    exportCancelled = true;
    exportModal.classList.remove('active');
    isExporting = false;
    startRenderingLoop();
});
imageInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        const url = URL.createObjectURL(file);
        faceImage.src = url;
        faceImage.onload = async () => {
            registerAsset('imageInput', file.name);

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
                updateSwapButtonState();

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

// Update swap button enabled state based on video and photo processing
function updateSwapButtonState() {
    const videoReady = sourceVideo.src && sourceVideo.readyState >= 2;
    const photoProcessed = window.PhotoProcessor && window.PhotoProcessor.isProcessed();
    const canEnable = videoReady && photoProcessed;

    enableSwapBtn.disabled = !canEnable;

    // Update status message
    if (!sourceVideo.src) {
        swapStatusEl.textContent = 'Import video and photo to enable';
    } else if (!photoProcessed) {
        swapStatusEl.textContent = 'Import and process a face photo';
    } else if (isSwapEnabled) {
        swapStatusEl.textContent = 'Face swap active — click to disable';
    } else {
        swapStatusEl.textContent = 'Ready — click to apply face swap';
    }
}

// Handle Enable Swap button click
enableSwapBtn.addEventListener('click', () => {
    if (enableSwapBtn.disabled) return;
    isSwapEnabled = !isSwapEnabled;
    enableSwapBtn.classList.toggle('active', isSwapEnabled);
    enableSwapBtn.querySelector('.btn-text').textContent = isSwapEnabled ? 'Disable Face Swap' : 'Apply Face Swap';
    updateSwapButtonState();
    // Redraw if paused
    if (!sourceVideo.src || sourceVideo.paused) {
        redrawCanvas();
    }
});

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

    // Detect landmarks on video frame (check cache first)
    if (window.FaceLandmarkerModule && window.FaceLandmarkerModule.isReady()) {
        if (sourceVideo.currentTime !== lastVideoTime) {
            const timeKey = Math.floor(sourceVideo.currentTime * 1000); // ms precision key

            if (videoLandmarkCache.has(timeKey)) {
                videoLandmarks = videoLandmarkCache.get(timeKey);
            } else {
                videoLandmarks = window.FaceLandmarkerModule.detectVideo(sourceVideo, timestamp);
                // Only cache if landmarks were actually found
                if (videoLandmarks && videoLandmarks.length > 0) {
                    videoLandmarkCache.set(timeKey, videoLandmarks);
                }
            }

            lastVideoTime = sourceVideo.currentTime;

            // Sync UI controls with current playback time
            if (!seekSlider.matches(':active')) {
                seekSlider.value = sourceVideo.currentTime;
            }
            updateTimeDisplay();
        }
    }

    // Perform real-time face swap if enabled
    if (isSwapEnabled &&
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

                        // Auto-match lighting
                        if (autoMatchCheckbox.checked) {
                            // Get stats from source (warp canvas) and target (video on main canvas)
                            const sourceStats = window.FaceBlender.getColorStats(warpCtx, videoPixelLandmarks, warpCanvas.width, warpCanvas.height);
                            const targetStats = window.FaceBlender.getColorStats(ctx, videoPixelLandmarks, mainCanvas.width, mainCanvas.height);

                            // Match colors on the warp canvas
                            if (sourceStats && targetStats) {
                                window.FaceBlender.matchColorStats(warpCtx, warpCanvas.width, warpCanvas.height, sourceStats, targetStats);
                            }
                        }

                        // Apply manual brightness/contrast
                        const brightness = parseInt(brightnessSlider.value) || 0;
                        const contrast = parseInt(contrastSlider.value) || 0;
                        if (brightness !== 0 || contrast !== 0) {
                            window.FaceBlender.adjustColor(warpCtx, warpCanvas.width, warpCanvas.height, brightness, contrast);
                        }

                        // Apply edge-feathered blending with falloff

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
    if (!isSwapEnabled && faceImage.complete && faceImage.naturalHeight !== 0 && faceImage.src) {
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
    if (!isSwapEnabled && debugModeCheckbox.checked && videoLandmarks && videoLandmarks.length > 0) {
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
