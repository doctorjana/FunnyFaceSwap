/**
 * Face Landmarker Module
 * Handles MediaPipe Face Landmarker initialization, detection, and debug drawing.
 */

let faceLandmarker = null;
let isInitialized = false;

/**
 * Initialize the Face Landmarker model asynchronously.
 * @returns {Promise<boolean>} True if initialization succeeded.
 */
async function initFaceLandmarker() {
    if (isInitialized) {
        console.log("FaceLandmarker already initialized.");
        return true;
    }

    try {
        console.log("Initializing FaceLandmarker...");
        const { FaceLandmarker, FilesetResolver } = await import(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8"
        );

        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm"
        );

        faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath:
                    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
                delegate: "GPU",
            },
            runningMode: "VIDEO",
            numFaces: 2, // Detect up to 2 faces (video + face image)
            outputFaceBlendshapes: false,
            outputFacialTransformationMatrixes: false,
        });

        isInitialized = true;
        console.log("FaceLandmarker initialized successfully.");
        return true;
    } catch (error) {
        console.error("Failed to initialize FaceLandmarker:", error);
        return false;
    }
}

/**
 * Detect landmarks from a video frame.
 * @param {HTMLVideoElement} video - The video element.
 * @param {number} timestamp - The current timestamp in milliseconds.
 * @returns {Array|null} Array of face landmarks or null if detection failed.
 */
function detectLandmarksVideo(video, timestamp) {
    if (!faceLandmarker || !isInitialized) {
        return null;
    }

    try {
        const result = faceLandmarker.detectForVideo(video, timestamp);
        return result.faceLandmarks || null;
    } catch (error) {
        console.error("Landmark detection failed:", error);
        return null;
    }
}

/**
 * Detect landmarks from a static image.
 * Note: This temporarily switches the running mode to IMAGE.
 * @param {HTMLImageElement} image - The image element.
 * @returns {Promise<Array|null>} Array of face landmarks or null if detection failed.
 */
async function detectLandmarksImage(image) {
    if (!faceLandmarker || !isInitialized) {
        return null;
    }

    try {
        // Switch to IMAGE mode for static image detection
        await faceLandmarker.setOptions({ runningMode: "IMAGE" });
        const result = faceLandmarker.detect(image);
        // Switch back to VIDEO mode
        await faceLandmarker.setOptions({ runningMode: "VIDEO" });
        return result.faceLandmarks || null;
    } catch (error) {
        console.error("Image landmark detection failed:", error);
        return null;
    }
}

/**
 * Draw landmarks on a canvas context.
 * @param {CanvasRenderingContext2D} ctx - The canvas context.
 * @param {Array} landmarks - Array of normalized landmarks (each with x, y, z).
 * @param {number} width - Canvas width.
 * @param {number} height - Canvas height.
 * @param {string} color - Color for the landmarks.
 */
function drawLandmarks(ctx, landmarks, width, height, color = "#00FF00") {
    if (!landmarks || landmarks.length === 0) {
        return;
    }

    ctx.fillStyle = color;
    ctx.strokeStyle = color;

    // Draw each landmark as a small circle
    for (const landmark of landmarks) {
        const x = landmark.x * width;
        const y = landmark.y * height;

        ctx.beginPath();
        ctx.arc(x, y, 2, 0, 2 * Math.PI);
        ctx.fill();
    }
}

/**
 * Draw face mesh connections for better visualization.
 * @param {CanvasRenderingContext2D} ctx - The canvas context.
 * @param {Array} landmarks - Array of normalized landmarks.
 * @param {number} width - Canvas width.
 * @param {number} height - Canvas height.
 * @param {string} color - Color for the mesh lines.
 */
function drawFaceMesh(ctx, landmarks, width, height, color = "rgba(0, 255, 0, 0.3)") {
    if (!landmarks || landmarks.length === 0) {
        return;
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;

    // Draw key facial feature outlines (simplified)
    // Face oval indices (approximate)
    const faceOval = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10];

    ctx.beginPath();
    for (let i = 0; i < faceOval.length; i++) {
        const idx = faceOval[i];
        if (landmarks[idx]) {
            const x = landmarks[idx].x * width;
            const y = landmarks[idx].y * height;
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
    }
    ctx.stroke();
}

// Canonical points for stable alignment (Dlib 68-style mapping)
const STABLE_LANDMARK_INDICES = [
    // Jawline
    234, 93, 132, 58, 172, 136, 150, 149, 152, 378, 379, 365, 397, 288, 361, 323, 454,
    // Nose Bridge
    168, 6, 197, 195,
    // Nose Tip
    5, 4, 1, 19, 94,
    // Left Eyebrow
    70, 63, 105, 66, 107,
    // Right Eyebrow
    336, 296, 334, 293, 300,
    // Left Eye (Outer contour, avoiding lids to minimize blink jitter)
    33, 160, 158, 133, 153, 144,
    // Right Eye (Outer contour)
    263, 387, 385, 362, 380, 373,
    // Outer Mouth Contour
    61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 308, 324, 318, 402, 317, 14, 87, 178, 88
];

/**
 * Filter landmarks to include only the designated stable features.
 * @param {Array} allLandmarks - Array of all detected face landmarks.
 * @returns {Array} Array of stable landmarks in consistent order.
 */
function getStableLandmarks(allLandmarks) {
    if (!allLandmarks) return [];
    return STABLE_LANDMARK_INDICES.map(index => allLandmarks[index]).filter(Boolean);
}

// Export functions for use in script.js
window.FaceLandmarkerModule = {
    init: initFaceLandmarker,
    detectVideo: detectLandmarksVideo,
    detectImage: detectLandmarksImage,
    drawLandmarks: drawLandmarks,
    drawFaceMesh: drawFaceMesh,
    getStableLandmarks: getStableLandmarks,
    isReady: () => isInitialized,
};
