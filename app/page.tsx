'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type WordRow = { id: string; meanings: string[]; reference_paths: string[] };

export default function Home() {
  const [current, setCurrent] = useState<WordRow | null>(null);
  const [userPaths, setUserPaths] = useState<string[]>([]); // multiple strokes
  const [points, setPoints] = useState<string>(''); // building current stroke
  const drawing = useRef(false);

  // refs for drawing surface
  const svgRef = useRef<SVGSVGElement | null>(null);

  // refs for reference paths measurement
  const refSvgRef = useRef<SVGSVGElement | null>(null);
  const refGroupRef = useRef<SVGGElement | null>(null);
  const [viewBox, setViewBox] = useState<string>('0 0 400 140');

  async function loadWord() {
    const { data, error } = await supabase.rpc('get_random_word');
    if (error) console.error(error);
    if (data && data.length) setCurrent(data[0]);
    setUserPaths([]);
    setPoints('');
  }

  useEffect(() => { loadWord(); }, []);

  // Measure the true bounds of all reference paths
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
    setPoints(`${p.x},${p.y}`);
  }

  function pointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!drawing.current) return;
    const p = cursor(e);
    setPoints(prev => (prev ? `${prev} ${p.x},${p.y}` : `${p.x},${p.y}`));
  }

  function pointerUp() {
    if (points) {
      const pts = points.split(' ');
      const path = pts.reduce((acc, xy, i) => {
        const [x, y] = xy.split(',');
        return acc + (i === 0 ? `M${x} ${y}` : ` L${x} ${y}`);
      }, '');
      setUserPaths(prev => [...prev, path]);
      setPoints('');
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

  async function submit() {
    if (!current || userPaths.length === 0) { alert('Draw something first'); return; }
    const { error } = await supabase.from('drawings').insert({
      word_id: current.id,
      meanings: current.meanings,
      reference_paths: current.reference_paths,
      user_paths: userPaths, // store all strokes
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

      {/* Reference paths, auto-scaled */}
      <svg
        ref={refSvgRef}
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

      {/* User drawing surface */}
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
        {/* Current stroke in progress */}
        {points && (
          <path
            d={points.split(' ').reduce((acc, xy, i) => {
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
        <button onClick={() => { setUserPaths([]); setPoints(''); }}>Clear</button>
        <button onClick={submit}>Save & Next</button>
      </div>
    </main>
  );
}
