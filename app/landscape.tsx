'use client';

import { useEffect, useRef, useState } from 'react';

const birds = [
  [10, 30, 1], [45, 15, .8], [68, 44, .7], [105, 9, .64], [135, 34, .58],
];

export function Landscape() {
  const [paused, setPaused] = useState(false);
  const [offscreen, setOffscreen] = useState(false);
  const landscapeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const landscape = landscapeRef.current;
    if (!landscape || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(([entry]) => setOffscreen(!entry.isIntersecting));
    observer.observe(landscape);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div className="landscape" data-paused={paused || offscreen} ref={landscapeRef} aria-hidden="true">
        <div className="landscape-photo" />
        <div className="landscape-tint" />
        <div className="living-sky">
          <svg className="sky-defs" width="0" height="0">
            <defs>
              <filter id="landscape-cloud-texture" x="-20%" y="-40%" width="140%" height="180%">
                <feTurbulence type="fractalNoise" baseFrequency=".012 .026" numOctaves="4" seed="12" result="noise" />
                <feDisplacementMap in="SourceGraphic" in2="noise" scale="28" xChannelSelector="R" yChannelSelector="G" />
                <feGaussianBlur stdDeviation="2.4" />
              </filter>
              <linearGradient id="landscape-cloud-light" x1="0" y1="0" x2="0" y2="1">
                <stop stopColor="#fff" />
                <stop offset=".6" stopColor="#f4f7f9" />
                <stop offset="1" stopColor="#a9bac8" stopOpacity=".38" />
              </linearGradient>
              <g id="landscape-cloud" filter="url(#landscape-cloud-texture)" fill="url(#landscape-cloud-light)">
                <ellipse cx="125" cy="108" rx="118" ry="34" />
                <ellipse cx="205" cy="80" rx="100" ry="55" />
                <ellipse cx="310" cy="65" rx="113" ry="63" />
                <ellipse cx="430" cy="88" rx="120" ry="49" />
                <ellipse cx="540" cy="110" rx="110" ry="31" />
                <ellipse cx="320" cy="119" rx="280" ry="27" />
              </g>
            </defs>
          </svg>
          {[0, 1, 2, 3].map(index => (
            <svg key={index} className="moving-cloud" viewBox="0 0 660 165">
              <use href="#landscape-cloud" />
            </svg>
          ))}
          <div className="landscape-sunlight" />
          <svg className="landscape-birds" viewBox="0 0 180 80">
            {birds.map(([x, y, scale], index) => (
              <g key={x} transform={'translate(' + x + ' ' + y + ') scale(' + scale + ')'}>
                <path d="M0 0 Q7 -9 14 0 Q21 -9 28 0" style={{ animationDelay: index * .14 + 's' }} />
              </g>
            ))}
          </svg>
        </div>
      </div>
      <button className="motion-toggle" type="button" onClick={() => setPaused(value => !value)}>
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d={paused ? 'M5 3l8 5-8 5z' : 'M5 3h2v10H5zm4 0h2v10H9z'} />
        </svg>
        {paused ? 'Resume animation' : 'Pause animation'}
      </button>
    </>
  );
}
