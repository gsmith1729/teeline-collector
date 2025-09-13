'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type WordRow = { id: string; meanings: string[]; reference_paths: string[] };

export default function Home() {
  const [current, setCurrent] = useState<WordRow | null>(null);

  // Drawing state
  const [userPaths, setUserPaths] = useState<string[]>([]); // finalized strokes
  const [currentPoints, setCurrentPoints] = useState<string>(''); // stroke in progress
  const drawing = useRef(false);

  // Refs for SVGs
  const svgRef = useRef<SVGSVGElement | null>(null);
  const refGroupRef = useRef<SVGGElement | null>(null);
  const [viewBox, setViewBox] = useState<string>('0 0 400 140');

  // Load a random word
  async function loadWord() {
    const { data, error } = await supabase.rpc('get_random_word');
    if (error) console.error(error);
    if (data && data.length) setCurrent(data[0]);
    setUserPaths([]);
    setCurrentPoints('');
  }

  useEffect(() => { loadWord(); }, []);

  // Compute bounding box for reference paths
  useEffect(() => {
    if (!current) return;
    const pad = 16;
    const id = requestAnimationFrame(() => {
      try {
        const g = refGroupRef.current;
        if (!g) return;
        const box = g.getBBox();
        const x = box.x - pad;
        const y = box.y - pad;
        const w = Math.max(box.width + pad * 2, 1);
        const h = Math.max(box.height + pad * 2, 1);
        setViewBox(`${x} ${y} ${w} ${h}`);
      } catch {
        setViewBox('0 0 400 140');
      }
    });
    return () => cancelAnimationFrame(id);
  }, [current]);

  // --- Drawing handlers ---
  function pointerDown(e: React.PointerEvent<SVGSVGElement>) {
    drawing.current = true;
    const p = cursor(e);
    setCurrentPoints(`${p.x},${p.y}`);
  }

  function pointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!drawing.current) return;
    const p = cursor(e);
    setCurrentPoints(prev =>
      prev ? `${prev} ${p.x},${p.y}` : `${p.x},${p.y}`
    );
  }

  function pointerUp() {
    if (currentPoints) {
      const pts = currentPoints.split(' ');
      const path = pts.reduce((acc, xy, i) => {
        const [x, y] = xy.split(',');
        return acc + (i === 0 ? `M${x} ${y}` : ` L${x} ${y}`);
      }, '');
      setUserPaths(prev => [...prev, path]); // ✅ accumulate strokes
      setCurrentPoints('');
    }
    drawing.current = false;
  }

  function cursor(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    const inv = ctm?.inverse();
    const p = pt.matrixTransform(inv!);
    return { x: Math.round(p.x), y: Math.round(p.y) };
  }

  // Submit drawing
  async function submit() {
    if (!current || userPaths.length === 0) {
      alert('Draw something first');
      return;
    }
    const { error } = await supabase.from('drawings').insert({
      word_id: current.id,
      meanings: current.meanings,
      reference_paths: current.reference_paths,
      user_paths: userPaths, // ✅ all strokes
      client_id: typeof window !== 'undefined' ? window.navigator.userAgent : null
    });
    if (error) { console.error(error); alert('Save failed'); return; }
    await loadWord();
  }

  if (!current) return <main style={{ padding: 24 }}>Loading…</main>;

  return (
    <main style={{ padding: 24, display: 'grid', gap: 16 }}>
      <h1>Teeline Collector</h1>
      <div><strong>Meanings:</strong> {current.meanings.join(', ')}</div>

      {/* Reference paths */}
      <svg
        width={400}
        height={140}
        viewBox={viewBox}
        preserveAspectRatio="xMinYMin meet"
        style={{ border: '1px solid #ccc', borderRadius: 8, background: 'white' }}
      >
        <g ref={refGroupRef}>
          {current.reference_paths.map((d, i) => (
            <path key={i} d={d} fill="none" stroke="black" strokeWidth={2} />
          ))}
        </g>
      </svg>

      {/* Drawing surface */}
      <svg
        ref={svgRef}
        width={400}
        height={140}
        style={{ border: '2px dashed #999', borderRadius: 8, touchAction: 'none', background: 'white' }}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerLeave={pointerUp}
      >
        {/* Finalized strokes */}
        {userPaths.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="black" strokeWidth={2} />
        ))}
        {/* Current stroke (red) */}
        {currentPoints && (
          <path
            d={currentPoints.split(' ').reduce((acc, xy, i) => {
              const [x, y] = xy.split(',');
              return acc + (i === 0 ? `M${x} ${y}` : ` L${x} ${y}`);
            }, '')}
            fill="none"
            stroke="red"
            strokeWidth={2}
          />
        )}
      </svg>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => { setUserPaths([]); setCurrentPoints(''); }}>Clear</button>
        <button onClick={submit}>Save & Next</button>
      </div>
    </main>
  );
}
