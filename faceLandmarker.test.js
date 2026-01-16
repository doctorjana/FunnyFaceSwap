import { describe, it, expect, beforeEach, vi } from 'vitest';

// Create a mock window object if it doesn't exist
if (typeof window === 'undefined') {
    global.window = {};
}

// Import the module
import './faceLandmarker.js';

describe('FaceLandmarkerModule', () => {
    let FaceLandmarkerModule;

    beforeEach(() => {
        FaceLandmarkerModule = window.FaceLandmarkerModule;
    });

    describe('getStableLandmarks', () => {
        it('should return stable landmarks from the full set', () => {
            // Create a dummy array of landmarks large enough to cover the indices
            const allLandmarks = new Array(478).fill(null).map((_, i) => ({ x: i, y: i, z: i }));

            const stable = FaceLandmarkerModule.getStableLandmarks(allLandmarks);

            // STABLE_LANDMARK_INDICES has 56 indices (based on the provided code snippet check)
            // We can check if it returns an array of valid landmarks
            expect(Array.isArray(stable)).toBe(true);
            expect(stable.length).toBeGreaterThan(0);

            // Check if specific known stable landmarks are present (e.g., nose tip 1)
            const noseTip = allLandmarks[1];
            expect(stable).toContain(noseTip);
        });

        it('should handle undefined or empty input', () => {
            expect(FaceLandmarkerModule.getStableLandmarks(null)).toEqual([]);
            expect(FaceLandmarkerModule.getStableLandmarks([])).toEqual([]);
        });
    });

    describe('drawLandmarks', () => {
        it('should draw circles on the canvas context', () => {
            const ctx = {
                fillStyle: '',
                strokeStyle: '',
                beginPath: vi.fn(),
                arc: vi.fn(),
                fill: vi.fn()
            };
            const landmarks = [
                { x: 0.5, y: 0.5, z: 0 }
            ];
            const width = 100;
            const height = 100;

            FaceLandmarkerModule.drawLandmarks(ctx, landmarks, width, height, 'red');

            expect(ctx.fillStyle).toBe('red');
            expect(ctx.strokeStyle).toBe('red');
            expect(ctx.beginPath).toHaveBeenCalled();
            expect(ctx.arc).toHaveBeenCalledWith(50, 50, 2, 0, 2 * Math.PI);
            expect(ctx.fill).toHaveBeenCalled();
        });

        it('should do nothing if landmarks are empty', () => {
            const ctx = {
                beginPath: vi.fn()
            };
            FaceLandmarkerModule.drawLandmarks(ctx, [], 100, 100);
            expect(ctx.beginPath).not.toHaveBeenCalled();
        });
    });
});
