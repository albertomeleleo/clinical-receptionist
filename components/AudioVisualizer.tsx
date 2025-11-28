import React, { useRef, useEffect } from 'react';
import { AudioVisualizerProps } from '../types';

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ analyser, isListening }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);

      analyser.getByteFrequencyData(dataArray);

      ctx.fillStyle = '#f8fafc'; // slate-50
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i] / 2;

        // Use clinic teal color
        ctx.fillStyle = `rgb(10, 147, 150)`;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
      }
    };

    if (isListening) {
        draw();
    } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [analyser, isListening]);

  return (
    <div className="w-full h-24 bg-slate-50 rounded-lg overflow-hidden border border-slate-200 shadow-inner">
      <canvas
        ref={canvasRef}
        width={300}
        height={100}
        className="w-full h-full block"
      />
    </div>
  );
};