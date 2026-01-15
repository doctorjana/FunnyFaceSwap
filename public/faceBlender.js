/**
 * FaceBlender Module
 * Edge-based feathering with controllable falloff
 */

(function () {
    'use strict';

    /**
     * Compute convex hull using Graham scan
     */
    function computeConvexHull(points) {
        if (points.length < 3) return points;

        let start = 0;
        for (let i = 1; i < points.length; i++) {
            if (points[i].y > points[start].y ||
                (points[i].y === points[start].y && points[i].x < points[start].x)) {
                start = i;
            }
        }

        [points[0], points[start]] = [points[start], points[0]];
        const pivot = points[0];

        const sorted = points.slice(1).sort((a, b) => {
            const angleA = Math.atan2(a.y - pivot.y, a.x - pivot.x);
            const angleB = Math.atan2(b.y - pivot.y, b.x - pivot.x);
            return angleA - angleB;
        });

        const hull = [pivot];
        for (const p of sorted) {
            while (hull.length > 1) {
                const top = hull[hull.length - 1];
                const second = hull[hull.length - 2];
                const cross = (top.x - second.x) * (p.y - second.y) -
                    (top.y - second.y) * (p.x - second.x);
                if (cross <= 0) {
                    hull.pop();
                } else {
                    break;
                }
            }
            hull.push(p);
        }

        return hull;
    }

    /**
     * Compute centroid of points
     */
    function computeCentroid(points) {
        let sumX = 0, sumY = 0;
        for (const p of points) {
            sumX += p.x;
            sumY += p.y;
        }
        return {
            x: sumX / points.length,
            y: sumY / points.length
        };
    }

    /**
     * Create edge-feathered mask with controllable falloff
     * @param {Array} landmarks - Face landmarks in pixel coordinates
     * @param {number} width - Canvas width
     * @param {number} height - Canvas height  
     * @param {number} edgeBlur - Amount of blur at edges (px)
     * @param {number} falloff - 0-100, controls how abrupt the transparency change is
     *                           Lower = gradual fade, Higher = abrupt/sharp transition
     */
    function createEdgeFeatheredMask(landmarks, width, height, edgeBlur, falloff = 70) {
        if (edgeBlur <= 0) return null;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // Get convex hull of landmarks
        const hull = computeConvexHull([...landmarks]);
        if (hull.length < 3) return null;

        // Compute centroid for radial gradient
        const centroid = computeCentroid(landmarks);

        // Find maximum distance from centroid to hull
        let maxDist = 0;
        for (const p of hull) {
            const dist = Math.sqrt((p.x - centroid.x) ** 2 + (p.y - centroid.y) ** 2);
            if (dist > maxDist) maxDist = dist;
        }

        // Falloff controls the gradient stops
        // falloff = 0: very gradual (solid starts at 0%, fades over long distance)
        // falloff = 100: very abrupt (solid until 90%, then quick fade)
        const solidEnd = (falloff / 100) * 0.85;  // Where solid white ends (0 to 0.85)
        const fadeStart = solidEnd;

        // Create radial gradient with controllable falloff
        const gradient = ctx.createRadialGradient(
            centroid.x, centroid.y, 0,
            centroid.x, centroid.y, maxDist * 1.05
        );

        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');           // Center: fully opaque
        gradient.addColorStop(solidEnd, 'rgba(255, 255, 255, 1)');    // Solid until falloff point
        gradient.addColorStop(Math.min(solidEnd + 0.15, 0.98), 'rgba(255, 255, 255, 0.3)'); // Quick transition
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');           // Edge: transparent

        // Draw hull shape with gradient fill
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(hull[0].x, hull[0].y);
        for (let i = 1; i < hull.length; i++) {
            ctx.lineTo(hull[i].x, hull[i].y);
        }
        ctx.closePath();
        ctx.fill();

        // Apply blur to soften edges
        if (edgeBlur > 3) {
            applyBlur(canvas, edgeBlur * 0.4);
        }

        return canvas;
    }

    function applyBlur(canvas, radius) {
        const ctx = canvas.getContext('2d');
        const temp = document.createElement('canvas');
        temp.width = canvas.width;
        temp.height = canvas.height;
        const tempCtx = temp.getContext('2d');

        tempCtx.filter = `blur(${radius}px)`;
        tempCtx.drawImage(canvas, 0, 0);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(temp, 0, 0);
    }

    /**
     * Apply edge-feathered blending to warped face
     */
    function applyFeatheredBlend(ctx, warpedCanvas, landmarks, edgeBlur, falloff = 70) {
        if (edgeBlur <= 0) {
            ctx.drawImage(warpedCanvas, 0, 0);
            return;
        }

        const width = warpedCanvas.width;
        const height = warpedCanvas.height;

        // Create edge-feathered mask with falloff
        const mask = createEdgeFeatheredMask(landmarks, width, height, edgeBlur, falloff);
        if (!mask) {
            ctx.drawImage(warpedCanvas, 0, 0);
            return;
        }

        // Apply mask to warped canvas
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d');

        // Draw warped face
        tempCtx.drawImage(warpedCanvas, 0, 0);

        // Apply mask using destination-in
        tempCtx.globalCompositeOperation = 'destination-in';
        tempCtx.drawImage(mask, 0, 0);

        // Draw result onto main canvas
        ctx.drawImage(tempCanvas, 0, 0);
    }

    /**
     * Convert RGB to LAB color space
     * LAB separates luminance (L) from chrominance (a,b) for better color matching
     */
    function rgbToLab(r, g, b) {
        // First convert RGB to XYZ
        let rNorm = r / 255;
        let gNorm = g / 255;
        let bNorm = b / 255;

        // Apply gamma correction
        rNorm = rNorm > 0.04045 ? Math.pow((rNorm + 0.055) / 1.055, 2.4) : rNorm / 12.92;
        gNorm = gNorm > 0.04045 ? Math.pow((gNorm + 0.055) / 1.055, 2.4) : gNorm / 12.92;
        bNorm = bNorm > 0.04045 ? Math.pow((bNorm + 0.055) / 1.055, 2.4) : bNorm / 12.92;

        rNorm *= 100;
        gNorm *= 100;
        bNorm *= 100;

        // Convert to XYZ using sRGB matrix
        const x = rNorm * 0.4124564 + gNorm * 0.3575761 + bNorm * 0.1804375;
        const y = rNorm * 0.2126729 + gNorm * 0.7151522 + bNorm * 0.0721750;
        const z = rNorm * 0.0193339 + gNorm * 0.1191920 + bNorm * 0.9503041;

        // Convert XYZ to LAB (D65 illuminant)
        const xRef = 95.047;
        const yRef = 100.000;
        const zRef = 108.883;

        let xNorm = x / xRef;
        let yNorm = y / yRef;
        let zNorm = z / zRef;

        const epsilon = 0.008856;
        const kappa = 903.3;

        xNorm = xNorm > epsilon ? Math.pow(xNorm, 1 / 3) : (kappa * xNorm + 16) / 116;
        yNorm = yNorm > epsilon ? Math.pow(yNorm, 1 / 3) : (kappa * yNorm + 16) / 116;
        zNorm = zNorm > epsilon ? Math.pow(zNorm, 1 / 3) : (kappa * zNorm + 16) / 116;

        const L = 116 * yNorm - 16;
        const a = 500 * (xNorm - yNorm);
        const bVal = 200 * (yNorm - zNorm);

        return { L, a, b: bVal };
    }

    /**
     * Convert LAB to RGB color space
     */
    function labToRgb(L, a, bVal) {
        // Convert LAB to XYZ
        const yNorm = (L + 16) / 116;
        const xNorm = a / 500 + yNorm;
        const zNorm = yNorm - bVal / 200;

        const epsilon = 0.008856;
        const kappa = 903.3;

        const xRef = 95.047;
        const yRef = 100.000;
        const zRef = 108.883;

        const x3 = Math.pow(xNorm, 3);
        const y3 = Math.pow(yNorm, 3);
        const z3 = Math.pow(zNorm, 3);

        const x = xRef * (x3 > epsilon ? x3 : (116 * xNorm - 16) / kappa);
        const y = yRef * (y3 > epsilon ? y3 : (116 * yNorm - 16) / kappa);
        const z = zRef * (z3 > epsilon ? z3 : (116 * zNorm - 16) / kappa);

        // Convert XYZ to RGB
        let r = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
        let g = x * -0.9692660 + y * 1.8760108 + z * 0.0415560;
        let b = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;

        r /= 100;
        g /= 100;
        b /= 100;

        // Apply inverse gamma correction
        r = r > 0.0031308 ? 1.055 * Math.pow(r, 1 / 2.4) - 0.055 : 12.92 * r;
        g = g > 0.0031308 ? 1.055 * Math.pow(g, 1 / 2.4) - 0.055 : 12.92 * g;
        b = b > 0.0031308 ? 1.055 * Math.pow(b, 1 / 2.4) - 0.055 : 12.92 * b;

        return {
            r: Math.max(0, Math.min(255, Math.round(r * 255))),
            g: Math.max(0, Math.min(255, Math.round(g * 255))),
            b: Math.max(0, Math.min(255, Math.round(b * 255)))
        };
    }

    /**
     * Get color statistics in LAB color space for face region
     * LAB provides better perceptual uniformity for color matching
     */
    function getColorStats(ctx, landmarks, width, height) {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        // Create a mask for the face region to only sample face pixels
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = width;
        maskCanvas.height = height;
        const maskCtx = maskCanvas.getContext('2d');

        const hull = computeConvexHull([...landmarks]);
        if (hull.length < 3) return null;

        maskCtx.fillStyle = 'white';
        maskCtx.beginPath();
        maskCtx.moveTo(hull[0].x, hull[0].y);
        for (let i = 1; i < hull.length; i++) {
            maskCtx.lineTo(hull[i].x, hull[i].y);
        }
        maskCtx.closePath();
        maskCtx.fill();

        const maskData = maskCtx.getImageData(0, 0, width, height).data;

        // Collect LAB values
        let lSum = 0, aSum = 0, bSum = 0;
        let lSqSum = 0, aSqSum = 0, bSqSum = 0;
        let count = 0;

        for (let i = 0; i < data.length; i += 4) {
            // Check if pixel is inside face mask
            if (maskData[i + 3] > 128) {
                const lab = rgbToLab(data[i], data[i + 1], data[i + 2]);

                lSum += lab.L;
                aSum += lab.a;
                bSum += lab.b;

                lSqSum += lab.L * lab.L;
                aSqSum += lab.a * lab.a;
                bSqSum += lab.b * lab.b;

                count++;
            }
        }

        if (count === 0) return null;

        const meanL = lSum / count;
        const meanA = aSum / count;
        const meanB = bSum / count;

        const stdL = Math.sqrt(Math.max(0, lSqSum / count - meanL * meanL));
        const stdA = Math.sqrt(Math.max(0, aSqSum / count - meanA * meanA));
        const stdB = Math.sqrt(Math.max(0, bSqSum / count - meanB * meanB));

        return { meanL, meanA, meanB, stdL, stdA, stdB };
    }

    /**
     * Match color statistics of source to target using LAB color space (Reinhard Color Transfer)
     * LAB-based matching provides superior results for skin tone matching
     */
    function matchColorStats(sourceCtx, width, height, sourceStats, targetStats) {
        if (!sourceStats || !targetStats) return;

        const imageData = sourceCtx.getImageData(0, 0, width, height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            // Only process non-transparent pixels
            if (data[i + 3] > 0) {
                // Convert to LAB
                const lab = rgbToLab(data[i], data[i + 1], data[i + 2]);

                // Apply Reinhard transfer in LAB space:
                // result = (pixel - sourceMean) * (targetStd / sourceStd) + targetMean
                const newL = (lab.L - sourceStats.meanL) * (targetStats.stdL / (sourceStats.stdL || 1)) + targetStats.meanL;
                const newA = (lab.a - sourceStats.meanA) * (targetStats.stdA / (sourceStats.stdA || 1)) + targetStats.meanA;
                const newB = (lab.b - sourceStats.meanB) * (targetStats.stdB / (sourceStats.stdB || 1)) + targetStats.meanB;

                // Convert back to RGB
                const rgb = labToRgb(newL, newA, newB);

                data[i] = rgb.r;
                data[i + 1] = rgb.g;
                data[i + 2] = rgb.b;
            }
        }

        sourceCtx.putImageData(imageData, 0, 0);
    }

    /**
     * Adjust brightness and contrast
     * brightness: -100 to 100
     * contrast: -100 to 100
     */
    function adjustColor(ctx, width, height, brightness, contrast) {
        if (brightness === 0 && contrast === 0) return;

        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        // Convert range [-100, 100] to factors
        const brightnessOffset = (brightness / 100) * 255; // -255 to 255
        const contrastFactor = (contrast + 100) / 100; // 0 to 2
        // Better contrast formula: factor = (259 * (contrast + 255)) / (255 * (259 - contrast))
        const contrastCorrected = (259 * (contrast + 255)) / (255 * (259 - contrast));

        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] > 0) {
                // Apply brightness
                let r = data[i] + brightnessOffset;
                let g = data[i + 1] + brightnessOffset;
                let b = data[i + 2] + brightnessOffset;

                // Apply contrast
                // Formula: factor * (color - 128) + 128
                r = contrastCorrected * (r - 128) + 128;
                g = contrastCorrected * (g - 128) + 128;
                b = contrastCorrected * (b - 128) + 128;

                data[i] = Math.max(0, Math.min(255, r));
                data[i + 1] = Math.max(0, Math.min(255, g));
                data[i + 2] = Math.max(0, Math.min(255, b));
            }
        }

        ctx.putImageData(imageData, 0, 0);
    }

    // Export module
    window.FaceBlender = {
        createEdgeFeatheredMask,
        applyFeatheredBlend,
        getColorStats,
        matchColorStats,
        adjustColor,
        computeConvexHull,
        computeCentroid
    };

})();
