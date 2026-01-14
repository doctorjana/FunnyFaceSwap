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

    // Export module
    window.FaceBlender = {
        createEdgeFeatheredMask,
        applyFeatheredBlend,
        computeConvexHull,
        computeCentroid
    };

})();
