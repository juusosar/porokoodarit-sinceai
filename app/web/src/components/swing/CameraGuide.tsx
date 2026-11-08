import { useEffect, useState, type CSSProperties, type RefObject } from 'react';
import { cn } from '@/lib/utils';
import { videoContentBox } from '@/lib/video-box';

export type GuideView = 'face-on' | 'dtl';

/**
 * Static framing guide over the camera feed or a picked video: corner brackets, a ghost golfer at address,
 * feet line and ball marker (face-on), or the target line from the ball (down the line, right-handed).
 * Portrait viewBox scaled with "meet", so the golfer keeps its shape on portrait and landscape feeds.
 * Pass `video` (shown with object-contain) to lay the guide over the picture itself, not the letterbox bars.
 */
export function CameraGuide({ view = 'face-on', className, video }: { view?: GuideView; className?: string; video?: RefObject<HTMLVideoElement | null> }) {
  const box = useVideoBox(video);
  const thin = { vectorEffect: 'non-scaling-stroke' } as const;
  return (
    <svg viewBox="40 130 310 490" preserveAspectRatio="xMidYMid meet" aria-hidden="true" data-testid={`camera-guide-${view}`} className={cn('pointer-events-none absolute', !box && 'inset-0 h-full w-full', className)} style={box}>
      <g stroke="#fff" strokeOpacity={0.9} strokeWidth={3} fill="none" strokeLinecap="square" style={thin}>
        <path d="M56 150h28M56 150v28M334 150h-28M334 150v28M56 600h28M56 600v-28M334 600h-28M334 600v-28" style={thin} />
      </g>
      {view === 'face-on' ? (
        <>
          <g stroke="#fff" opacity={0.22} strokeLinecap="round" fill="none">
            <circle cx={195} cy={250} r={19} fill="#fff" stroke="none" />
            <path d="M195 282V405" strokeWidth={44} />
            <path d="M176 292L198 420M214 292L202 420" strokeWidth={15} />
            <path d="M183 412L163 562M207 412L229 562" strokeWidth={20} />
          </g>
          <path d="M200 420L221 560" stroke="#fff" strokeOpacity={0.5} strokeWidth={2.5} strokeLinecap="round" style={thin} />
          <g className="text-primary" stroke="currentColor" fill="none">
            <path d="M96 572H294" strokeWidth={2} strokeDasharray="10 6" style={thin} />
            <circle cx={223} cy={565} r={8} strokeWidth={2.5} style={thin} />
          </g>
        </>
      ) : (
        <>
          <g stroke="#fff" opacity={0.22} strokeLinecap="round" fill="none">
            <circle cx={168} cy={262} r={19} fill="#fff" stroke="none" />
            <path d="M164 296L128 400" strokeWidth={40} />
            <path d="M172 300L198 432" strokeWidth={15} />
            <path d="M128 404L152 488L140 568" strokeWidth={22} />
          </g>
          <path d="M198 432L238 568" stroke="#fff" strokeOpacity={0.5} strokeWidth={2.5} strokeLinecap="round" style={thin} />
          <g className="text-primary" stroke="currentColor" fill="none">
            <path d="M246 574L252 440" strokeWidth={3} strokeDasharray="12 7" style={thin} />
            <circle cx={246} cy={574} r={7} strokeWidth={2.5} style={thin} />
          </g>
        </>
      )}
    </svg>
  );
}

function useVideoBox(video?: RefObject<HTMLVideoElement | null>): CSSProperties | undefined {
  const [box, setBox] = useState<CSSProperties>();
  useEffect(() => {
    const el = video?.current;
    if (!el) return;
    const update = () => setBox(videoContentBox(el.clientWidth, el.clientHeight, el.videoWidth, el.videoHeight));
    update();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    ro?.observe(el);
    el.addEventListener('loadedmetadata', update);
    el.addEventListener('resize', update); // stream size changes (rotation)
    return () => { ro?.disconnect(); el.removeEventListener('loadedmetadata', update); el.removeEventListener('resize', update); };
  }, [video]);
  return box;
}
