const videoInput = document.getElementById('videoInput');
const imageInput = document.getElementById('imageInput');
const mainCanvas = document.getElementById('mainCanvas');
const ctx = mainCanvas.getContext('2d');
const sourceVideo = document.getElementById('sourceVideo');
const faceImage = document.getElementById('faceImage');
const placeholder = document.getElementById('placeholder');

// Helper to update label text
function updateLabel(inputId, filename) {
    const label = document.querySelector(`label[for="${inputId}"]`);
    const textSpan = label.querySelector('.text');
    const subTextSpan = label.querySelector('.sub-text');

    label.classList.add('active');
    textSpan.textContent = "Selected";
    subTextSpan.textContent = filename;
}

let renderLoopId;

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
imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const url = URL.createObjectURL(file);
        faceImage.src = url;
        faceImage.onload = () => {
            updateLabel('imageInput', file.name);
        }
    }
});

function drawFrame() {
    ctx.drawImage(sourceVideo, 0, 0, mainCanvas.width, mainCanvas.height);

    // Draw the face image in the corner if it exists (just to show it loaded)
    if (faceImage.complete && faceImage.naturalHeight !== 0 && faceImage.src) {
        const size = Math.min(mainCanvas.width, mainCanvas.height) * 0.2;
        const ratio = faceImage.naturalWidth / faceImage.naturalHeight;
        ctx.drawImage(faceImage, 10, 10, size * ratio, size); // corrected aspect ratio logic
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
