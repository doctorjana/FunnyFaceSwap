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

// Handle Video Upload
videoInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const url = URL.createObjectURL(file);
        sourceVideo.src = url;
        updateLabel('videoInput', file.name);
        
        // When video metadata is loaded, resize canvas
        sourceVideo.onloadedmetadata = () => {
            mainCanvas.width = sourceVideo.videoWidth;
            mainCanvas.height = sourceVideo.videoHeight;
            placeholder.style.display = 'none';
            // Draw first frame
            sourceVideo.currentTime = 0;
            drawFrame(); // simple initial draw
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

// Simple render loop (mostly static for now)
function drawFrame() {
    if (sourceVideo.readyState >= 2) {
        ctx.drawImage(sourceVideo, 0, 0, mainCanvas.width, mainCanvas.height);
        
        // Draw the face image in the corner if it exists (just to show it loaded)
        if (faceImage.complete && faceImage.naturalHeight !== 0) {
            const size = Math.min(mainCanvas.width, mainCanvas.height) * 0.2;
            ctx.drawImage(faceImage, 10, 10, size, size * (faceImage.height / faceImage.width));
        }
    }
    requestAnimationFrame(drawFrame);
}

// Start video playback when ready (muted) - optional, for now just load it
sourceVideo.addEventListener('canplay', () => {
   // sourceVideo.play(); // Auto-play could be annoying or blocked, let's just leave it ready
   drawFrame();
});
