"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/*  NightSky — พื้นหลังกลางคืนของหน้า Login                            */
/*  - ท้องฟ้าม่วงเข้มไล่เฉด (ไม่ดำสนิท) + หมอกเนบิวลาจางๆ                 */
/*  - ดาวกระพริบ (CSS ล้วน เบามาก)                                      */
/*  - ดาวตกเป็นระยะๆ และดาวหางพาดผ่านซ้าย↔ขวา                           */
/*  ใช้เฉพาะตอนกลางคืน — ส่วนกลางวันยังเป็นพื้นหลังเดิม                    */
/* ------------------------------------------------------------------ */

/** สุ่มแบบกำหนดผลลัพธ์ตายตัว (seeded) → server กับ client ได้ดาวชุดเดียวกัน ไม่เกิด hydration mismatch */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Star = {
  id: number;
  x: number; // %
  y: number; // %
  size: number; // px
  delay: number; // s
  dur: number; // s
  base: number; // opacity ต่ำสุด
  color: string;
  glow: boolean;
};

const STAR_COLORS = ["#ffffff", "#ffffff", "#e9e1ff", "#c7d2fe", "#fbcfe8", "#fef3c7"];

function makeStars(count: number): Star[] {
  const rnd = mulberry32(20260502);
  return Array.from({ length: count }, (_, i) => {
    const bright = rnd() > 0.88;
    return {
      id: i,
      x: rnd() * 100,
      y: rnd() * 100,
      size: bright ? 2.4 + rnd() * 1.4 : 1 + rnd() * 1.4,
      delay: rnd() * 6,
      dur: 2.2 + rnd() * 3.8,
      base: 0.25 + rnd() * 0.3,
      color: STAR_COLORS[Math.floor(rnd() * STAR_COLORS.length)],
      glow: bright,
    };
  });
}

type Spark = { off: number; dy: number; size: number; delay: number };

type SkyEvent = {
  id: number;
  kind: "shoot" | "comet" | "meteor";
  top: number; // % แนวตั้งของจุดเริ่ม
  startX: string; // ตำแหน่งเริ่มแนวนอน (CSS value)
  angle: number; // องศาของทิศที่หัวพุ่งไป (0 = ขวา, 180 = ซ้าย)
  length: number; // px ความยาวหางหลัก
  headSize: number; // px
  dur: number; // วินาที
  alpha: number; // ความสว่างรวม (ไกล = จาง, ใกล้ = สว่าง) → ให้ความรู้สึกมีมิติ
  dist: string; // ระยะที่เดินทาง (CSS value)
  c1: string; // สีหางหลัก (ion tail)
  c2: string; // สีหางฝุ่น (dust tail)
  sparks: Spark[];
  fl: number[]; // เลขสุ่ม 0..1 ต่อดวง → ให้แต่ละชั้นกระพริบไม่พร้อมกัน (คงที่ ไม่เปลี่ยนตอน re-render)
  flip?: number; // 1 = ซ้าย→ขวา, -1 = ขวา→ซ้าย (ให้ควันลอยขึ้น/เศษไฟตกลงตามโลกจริง)
  puffs?: Puff[]; // ก้อนควันดำ (อุกกาบาต)
  embers?: Ember[]; // เศษไฟร่วง (อุกกาบาต)
};
type Puff = { x: number; dy: number; size: number; delay: number; life: number; sx: number; sy: number; grow: number };
type Ember = { x: number; dy: number; size: number; delay: number; life: number; sx: number; sy: number };

const SHOOT_COLORS = ["#ffffff", "#e0e7ff", "#ddd6fe", "#bae6fd"];
// [หางหลัก, หางฝุ่น]
const COMET_PALETTES: [string, string][] = [
  ["#93e5ff", "#c4b5fd"], // ฟ้า + ม่วง
  ["#a5b4fc", "#f0abfc"], // คราม + ชมพู
  ["#fde68a", "#fb7185"], // ทอง + กุหลาบ
  ["#99f6e4", "#a5b4fc"], // มินต์ + คราม
];

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export function NightSky({
  reduce,
  lite,
  paused,
}: {
  reduce: boolean;
  lite: boolean;
  paused: boolean;
}) {
  const stars = useMemo(() => makeStars(lite ? 55 : 130), [lite]);
  const [events, setEvents] = useState<SkyEvent[]>([]);
  const idRef = useRef(0);

  // ดาวตก (เร็ว) ทุก ~5–11 วินาที  |  ดาวหาง (ช้า ผ่านทั้งจอ) ทุก ~16–28 วินาที
  useEffect(() => {
    if (reduce || paused) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let alive = true;

    const push = (ev: Omit<SkyEvent, "id" | "fl">) => {
      const fl = Array.from({ length: 5 }, () => Math.random());
      setEvents((prev) => {
        if (prev.length >= 5) return prev;
        if (ev.kind === "meteor" && prev.some((k) => k.kind === "meteor")) return prev; // อุกกาบาตหนัก → ทีละดวง
        return [...prev, { ...ev, fl, id: ++idRef.current }];
      });
    };

    const spawnShoot = () => {
      // near: 0.35–1  → ใกล้ = ยาว/สว่าง/เร็ว , ไกล = สั้น/จาง/ช้า
      const near = 0.35 + Math.random() * 0.65;
      const ltr = Math.random() > 0.5;
      const a = 18 + Math.random() * 22;
      push({
        kind: "shoot",
        top: 4 + Math.random() * 38,
        startX: ltr ? `${5 + Math.random() * 55}%` : `${95 - Math.random() * 55}%`,
        angle: ltr ? a : 180 - a,
        length: 80 + 140 * near,
        headSize: 2.2 + 2.6 * near,
        dur: 1.6 - 0.8 * near,
        alpha: 0.5 + 0.5 * near,
        dist: `${320 + 320 * near}px`,
        c1: pick(SHOOT_COLORS),
        c2: "#a78bfa",
        sparks: [],
      });
    };

    const spawnComet = () => {
      const near = 0.4 + Math.random() * 0.6;
      const ltr = Math.random() > 0.5;
      const a = 4 + Math.random() * 6; // มุมตื้น ไม่ตกลงไปชนโซนรถยกด้านล่าง
      const length = 230 + 170 * near;
      const headSize = 5 + 4.5 * near;
      const [c1, c2] = pick(COMET_PALETTES);
      push({
        kind: "comet",
        top: 5 + Math.random() * 29,
        startX: ltr ? "-60px" : "calc(100vw + 60px)",
        angle: ltr ? a : 180 - a,
        length,
        headSize,
        dur: 13 - 5 * near,
        alpha: 0.7 + 0.3 * near,
        dist: "calc(100vw + 460px)",
        c1,
        c2,
        sparks: Array.from({ length: 9 }, () => ({
          off: 8 + Math.random() * length * 0.85,
          dy: (Math.random() - 0.5) * headSize * 1.8,
          size: 1.2 + Math.random() * 2.2,
          delay: Math.random() * 2,
        })),
      });
    };

    // อุกกาบาต: ลูกไฟลุกรอบหัว + ควันดำค้างอยู่บนฟ้า + เศษไฟร่วง
    const spawnMeteor = () => {
      const near = 0.5 + Math.random() * 0.5;
      const ltr = Math.random() > 0.5;
      const a = 5 + Math.random() * 9; // มุมตื้น ไม่พุ่งลงไปทับฟอร์มด้านล่าง
      const L = 230 + 110 * near;
      const h = 15 + 8 * near; // ก้อนหินใหญ่ขึ้น (เส้นผ่านศูนย์กลาง ≈ 2h = 30–46px)
      const W = typeof window === "undefined" ? 1200 : window.innerWidth;
      const margin = L + 40; // เริ่ม/จบนอกจอ → หัวและหางเข้า-ออกเต็มตัว ไม่หายกลางฟ้า
      const distPx = (W + 2 * margin) / Math.cos((a * Math.PI) / 180);
      const dur = distPx / (300 + 120 * near); // ความเร็วคงที่ (px/วินาที)
      const nP = lite ? 11 : 20;
      const nE = lite ? 9 : 18;
      // ควันเริ่มโผล่หลังปลายหางไฟ (~0.55L) → delay = เวลาที่หัวผ่านจุดนั้นไปแล้ว
      const puffs: Puff[] = Array.from({ length: nP }, (_, i) => {
        const x0 = margin * 0.5;
        const x = x0 + ((i + Math.random() * 0.8) / nP) * (distPx - x0 - L * 0.55);
        return {
          x,
          dy: (Math.random() - 0.5) * h * 1.3,
          size: h * (0.9 + Math.random() * 1.0),
          delay: ((x + L * 0.55) / distPx) * dur,
          life: 2.6 + Math.random() * 1.8,
          sx: -(10 + Math.random() * 34),
          sy: -(16 + Math.random() * 42),
          grow: 2.2 + Math.random() * 1.0,
        };
      });
      const embers: Ember[] = Array.from({ length: nE }, () => {
        const x = Math.random() * (distPx - L * 0.2);
        return {
          x,
          dy: (Math.random() - 0.5) * h,
          size: 1.5 + Math.random() * 2.2,
          delay: (x / distPx) * dur,
          life: 0.8 + Math.random() * 1.1,
          sx: -(Math.random() * 46),
          sy: 14 + Math.random() * 54,
        };
      });
      push({
        kind: "meteor",
        top: 6 + Math.random() * 26,
        startX: ltr ? `-${margin}px` : `calc(100vw + ${margin}px)`,
        angle: ltr ? a : 180 - a,
        length: L,
        headSize: h,
        dur,
        alpha: 1,
        dist: `${distPx}px`,
        c1: "#ffb347",
        c2: "#ff5a1f",
        sparks: [],
        flip: ltr ? 1 : -1,
        puffs,
        embers,
      });
    };

    const loop = (fn: () => void, minMs: number, maxMs: number, firstMs: number) => {
      const run = (wait: number) => {
        timers.push(
          setTimeout(() => {
            if (!alive) return;
            fn();
            run(minMs + Math.random() * (maxMs - minMs));
          }, wait)
        );
      };
      run(firstMs);
    };

    // ดาวตกบางครั้งมาเป็นคู่ (มีดวงที่สองตามมาเล็กน้อย)
    const shootMaybeDouble = () => {
      spawnShoot();
      if (Math.random() < 0.3) {
        timers.push(
          setTimeout(() => {
            if (alive) spawnShoot();
          }, 250 + Math.random() * 450)
        );
      }
    };

    loop(shootMaybeDouble, 5000, 11000, 1800);
    loop(spawnComet, 16000, 28000, 6000);
    loop(spawnMeteor, 14000, 26000, 3500);

    return () => {
      alive = false;
      timers.forEach(clearTimeout);
      // แท็บถูกซ่อน/ปิดโหมด → ล้างดาวตก/ดาวหางที่ค้างอยู่
      setEvents([]);
    };
  }, [reduce, paused, lite]);

  const removeEvent = (id: number) =>
    setEvents((prev) => prev.filter((e) => e.id !== id));

  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      <style>{CSS}</style>

      {/* ท้องฟ้า: ม่วงเข้ม → ม่วงสว่างขึ้นช่วงล่าง (ไม่มืดสนิท) */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, #1c1745 0%, #2a2060 35%, #402a7c 70%, #5a3a96 100%)",
        }}
      />

      {/* หมอกเนบิวลา (radial-gradient ล้วน ไม่ใช้ blur → เบา) */}
      <div
        className="absolute inset-0"
        style={{
          background: [
            "radial-gradient(60% 45% at 12% 8%, rgba(139,92,246,0.38), transparent 70%)",
            "radial-gradient(50% 40% at 92% 30%, rgba(217,70,239,0.22), transparent 70%)",
            "radial-gradient(70% 45% at 50% 105%, rgba(129,140,248,0.40), transparent 70%)",
            "radial-gradient(35% 28% at 78% 78%, rgba(244,114,182,0.16), transparent 70%)",
          ].join(","),
        }}
      />

      {/* ดาวกระพริบ */}
      {stars.map((s) => (
        <span
          key={s.id}
          className={reduce ? "" : "ns-star"}
          style={
            {
              position: "absolute",
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: s.size,
              height: s.size,
              borderRadius: "9999px",
              background: s.color,
              opacity: reduce ? 0.7 : s.base,
              boxShadow: s.glow
                ? `0 0 ${s.size * 3}px ${s.size * 0.6}px ${s.color}88`
                : undefined,
              animationDelay: `${s.delay}s`,
              animationDuration: `${s.dur}s`,
              "--ns-base": s.base,
            } as React.CSSProperties
          }
        />
      ))}

      {/* ดาวตก + ดาวหาง (หลายชั้น: แสงฟุ้ง / หางเรียวแหลม / แกนสว่าง / หางฝุ่น / ประกาย / หัวมีแฟลร์) */}
      {events.map((e) => {
        if (e.kind === "meteor") {
          return <Meteor key={e.id} e={e} lite={lite} onEnd={() => removeEvent(e.id)} />;
        }
        const isComet = e.kind === "comet";
        const h = e.headSize;
        const L = e.length;
        const rootStyle = {
          left: e.startX,
          top: `${e.top}%`,
          transform: `rotate(${e.angle}deg)`,
          opacity: e.alpha,
          "--d": e.dist,
        } as React.CSSProperties;

        return (
          <span key={e.id} className="ns-ev" style={rootStyle}>
            {/* ร่องรอยแสงที่ค้างไว้บนฟ้า แล้วค่อยๆ จางหาย (เฉพาะดาวตก) */}
            {!isComet && (
              <span
                className="ns-trail"
                onAnimationEnd={() => removeEvent(e.id)}
                style={{
                  animationDuration: `${e.dur * 1.7}s`,
                  background: `linear-gradient(90deg, transparent, ${e.c1}88)`,
                }}
              />
            )}

            <span
              className={isComet ? "ns-mover ns-mover-c" : "ns-mover ns-mover-s"}
              onAnimationEnd={isComet ? () => removeEvent(e.id) : undefined}
              style={{ animationDuration: `${e.dur}s` }}
            >
              {/* 1) แสงฟุ้งรอบหาง (กระเพื่อมแบบไม่สม่ำเสมอ) */}
              <i
                className="ns-layer ns-flick"
                style={{
                  right: 0,
                  top: -h * 2,
                  width: L * 0.9,
                  height: h * 4,
                  background: `radial-gradient(ellipse 100% 50% at 100% 50%, ${e.c1}66, transparent 72%)`,
                  ...fv(e.fl[0], 1.9),
                }}
              />

              {/* 2) หางฝุ่น — แกว่งไปมาเหมือนถูกลมสุริยะพัด — เฉพาะดาวหาง */}
              {isComet && !lite && (
                <Taper
                  cls="ns-sway"
                  blur={h * 0.4}
                  r={[e.fl[1], e.fl[2]]}
                  speed={3.4}
                  bg={`linear-gradient(90deg, transparent, ${e.c2}bb)`}
                  style={{
                    right: 0,
                    top: -h * 0.95,
                    width: L * 0.78,
                    height: h * 1.9,
                    transformOrigin: "100% 50%",
                    opacity: 0.85,
                    "--r": "-6deg",
                  } as React.CSSProperties}
                />
              )}

              {/* 3) หางหลัก (ขอบนุ่ม หายใจเข้า-ออก + กระพริบ) */}
              <Taper
                cls="ns-breathe"
                blur={lite ? 0 : h * 0.22}
                r={[e.fl[3], e.fl[4]]}
                speed={1.7}
                bg={`linear-gradient(90deg, transparent, ${e.c1}dd)`}
                style={{ right: 0, top: -h * 0.65, width: L * 0.82, height: h * 1.3 }}
              />

              {/* 4) แกนสว่างบางๆ ตรงกลาง */}
              <Taper
                cls="ns-breathe"
                blur={lite ? 0 : h * 0.1}
                r={[e.fl[2], e.fl[0]]}
                speed={1.3}
                bg="linear-gradient(90deg, transparent, #ffffff)"
                style={{ right: 0, top: -h * 0.25, width: L * 0.5, height: h * 0.5 }}
              />

              {/* 5) ประกายเล็กๆ ในหาง (เฉพาะดาวหาง) */}
              {isComet &&
                !lite &&
                e.sparks.map((sp, i) => (
                  <i
                    key={i}
                    className="ns-spark"
                    style={{
                      right: sp.off,
                      top: sp.dy - sp.size / 2,
                      width: sp.size,
                      height: sp.size,
                      background: i % 2 ? e.c1 : e.c2,
                      boxShadow: `0 0 ${sp.size * 2.5}px ${e.c1}`,
                      animationDelay: `${sp.delay}s`,
                    }}
                  />
                ))}

              {/* 6) โคม่ารอบหัว + หัวสว่าง + แฟลร์กากบาท */}
              <i
                className="ns-layer ns-flick"
                style={{
                  ...fv(e.fl[1], 1.2),
                  left: -h * 2.6,
                  top: -h * 2.6,
                  width: h * 5.2,
                  height: h * 5.2,
                  borderRadius: "9999px",
                  background: `radial-gradient(circle, ${e.c1}aa 0%, ${e.c1}33 45%, transparent 70%)`,
                }}
              />
              <i
                className={isComet ? "ns-flare ns-flare-h ns-pulse" : "ns-flare ns-flare-h"}
                style={{
                  left: -h * 4,
                  top: -0.5,
                  width: h * 8,
                  background: "linear-gradient(90deg, transparent, #fff, transparent)",
                }}
              />
              <i
                className={isComet ? "ns-flare ns-flare-v ns-pulse" : "ns-flare ns-flare-v"}
                style={{
                  top: -h * 3,
                  left: -0.5,
                  height: h * 6,
                  background: "linear-gradient(180deg, transparent, #fff, transparent)",
                }}
              />
              <i
                className="ns-layer"
                style={{
                  left: -h / 2,
                  top: -h / 2,
                  width: h,
                  height: h,
                  borderRadius: "9999px",
                  background: "#ffffff",
                  boxShadow: `0 0 ${h * 2}px ${h * 0.7}px ${e.c1}, 0 0 ${h * 5}px ${h * 1.4}px ${e.c1}77`,
                }}
              />
            </span>
          </span>
        );
      })}
    </div>
  );
}

/** กำหนดความเร็ว/จังหวะเริ่มของแต่ละชั้นให้ต่างกัน → กระพริบไม่พร้อมกัน ดูมีชีวิต */
const fv = (r: number, base: number): React.CSSProperties => ({
  animationDuration: `${(base * (0.7 + r * 0.9)).toFixed(2)}s`,
  animationDelay: `-${(r * 3).toFixed(2)}s`,
});

/** ชั้นหางเรียว: ตัวนอก = blur + transform (แกว่ง/หายใจ), ตัวใน = clip-path + กระพริบ (blur ต้องอยู่นอก clip-path ขอบถึงจะนุ่ม) */
function Taper({
  cls,
  style,
  bg,
  blur,
  r,
  speed,
}: {
  cls: string;
  style: React.CSSProperties;
  bg: string;
  blur: number;
  r: [number, number];
  speed: number;
}) {
  return (
    <i
      className={`ns-layer ${cls}`}
      style={{ ...style, ...fv(r[0], speed), filter: blur > 0 ? `blur(${blur}px)` : undefined }}
    >
      <b className="ns-taper ns-flick" style={{ background: bg, ...fv(r[1], speed * 0.6) }} />
    </i>
  );
}

// ลิ้นไฟรอบหัวอุกกาบาต: r = มุมฐาน, len = ความยาวสัมพัทธ์, s = จังหวะ
const TONGUES = [
  { r: -28, len: 0.5, s: 0.42, p: 0.1, q: 0.7 },
  { r: -12, len: 0.78, s: 0.55, p: 0.4, q: 0.2 },
  { r: 10, len: 0.7, s: 0.37, p: 0.8, q: 0.5 },
  { r: 26, len: 0.46, s: 0.48, p: 0.3, q: 0.9 },
  { r: -42, len: 0.28, s: 0.33, p: 0.6, q: 0.1 },
  { r: 40, len: 0.26, s: 0.4, p: 0.9, q: 0.6 },
];

function Meteor({ e, lite, onEnd }: { e: SkyEvent; lite: boolean; onEnd: () => void }) {
  const h = e.headSize;
  const L = e.length;
  const flip = e.flip ?? 1;
  const [f0, f1, f2] = e.fl;
  const bl = (n: number) => (lite ? 0 : n);
  const tongues = lite ? TONGUES.slice(0, 3) : TONGUES;

  return (
    <span
      className="ns-ev"
      style={
        {
          left: e.startX,
          top: `${e.top}%`,
          transform: `rotate(${e.angle}deg)`,
          opacity: e.alpha,
          "--d": e.dist,
        } as React.CSSProperties
      }
    >
      {/* ตัวนับอายุ: ลบดวงนี้ทิ้งหลังควันจางหมด */}
      <span className="ns-life" onAnimationEnd={onEnd} style={{ animationDuration: `${e.dur + 4.6}s` }} />

      {/* ควันดำ — ติดอยู่กับท้องฟ้า (ไม่เคลื่อนตามหัว) ค่อยๆ ขยายและลอยขึ้นแล้วจาง */}
      {e.puffs?.map((p, i) => (
        <i
          key={`p${i}`}
          className="ns-puff"
          style={
            {
              left: p.x - p.size / 2,
              top: p.dy - p.size / 2,
              width: p.size,
              height: p.size,
              filter: lite ? undefined : `blur(${(p.size * 0.14).toFixed(1)}px)`,
              animationDuration: `${p.life}s`,
              animationDelay: `${p.delay}s`,
              "--sx": `${p.sx}px`,
              "--sy": `${p.sy * flip}px`,
              "--grow": p.grow,
            } as React.CSSProperties
          }
        >
          {/* ความร้อนจากไฟยังส้มอยู่ช่วงแรก แล้วดับเหลือควันดำ */}
          <b className="ns-heat" style={{ animationDuration: `${p.life * 0.25}s`, animationDelay: `${p.delay}s` }} />
        </i>
      ))}

      {/* เศษไฟร่วงหล่น */}
      {e.embers?.map((m, i) => (
        <i
          key={`m${i}`}
          className="ns-ember"
          style={
            {
              left: m.x,
              top: m.dy - m.size / 2,
              width: m.size,
              height: m.size,
              animationDuration: `${m.life}s`,
              animationDelay: `${m.delay}s`,
              "--sx": `${m.sx}px`,
              "--sy": `${m.sy * flip}px`,
            } as React.CSSProperties
          }
        />
      ))}

      <span className="ns-mover ns-mover-m" style={{ animationDuration: `${e.dur}s` }}>
        {/* 1) แสงไฟฟุ้งรอบตัว */}
        <i
          className="ns-layer ns-fire"
          style={{
            left: -h * 5,
            top: -h * 5,
            width: h * 10,
            height: h * 10,
            borderRadius: "9999px",
            background:
              "radial-gradient(circle, rgba(255,175,80,.55) 0%, rgba(255,95,30,.26) 40%, transparent 70%)",
            ...fv(f0, 0.8),
          }}
        />

        {/* 2) หางไฟ 3 ชั้น แดง → ส้ม → เหลืองขาว */}
        <Taper
          cls="ns-lick"
          blur={bl(h * 0.5)}
          r={[f1, f2]}
          speed={0.7}
          bg="linear-gradient(90deg, transparent 0%, rgba(150,28,36,.5) 35%, rgba(255,105,30,.92) 100%)"
          style={{ right: 0, top: -h * 1.3, width: L, height: h * 2.6 }}
        />
        <Taper
          cls="ns-lick"
          blur={bl(h * 0.3)}
          r={[f2, f0]}
          speed={0.55}
          bg="linear-gradient(90deg, transparent 0%, rgba(255,150,40,.8) 55%, #ffd36b 100%)"
          style={{ right: 0, top: -h * 0.85, width: L * 0.72, height: h * 1.7 }}
        />
        <Taper
          cls="ns-lick"
          blur={bl(h * 0.15)}
          r={[f0, f1]}
          speed={0.45}
          bg="linear-gradient(90deg, transparent 0%, #fff0b8 60%, #ffffff 100%)"
          style={{ right: 0, top: -h * 0.42, width: L * 0.42, height: h * 0.85 }}
        />

        {/* 3) ลิ้นไฟแลบรอบหัว (แต่ละลิ้นส่ายคนละจังหวะ) */}
        {tongues.map((t, i) => (
          <Taper
            key={i}
            cls="ns-tongue"
            blur={bl(h * 0.2)}
            r={[t.p, t.q]}
            speed={t.s}
            bg="linear-gradient(90deg, transparent 0%, rgba(255,110,30,.85) 70%, rgba(255,205,110,.95) 100%)"
            style={
              {
                right: 0,
                top: -h * 0.45,
                width: L * t.len,
                height: h * 0.9,
                transformOrigin: "100% 50%",
                "--r": `${t.r}deg`,
              } as React.CSSProperties
            }
          />
        ))}

        {/* 4) แฟลร์เล็กๆ */}
        <i
          className="ns-flare ns-flare-h ns-pulse"
          style={{ left: -h * 3.5, top: -0.5, width: h * 7, background: "linear-gradient(90deg, transparent, #fff, transparent)" }}
        />

        {/* 5) ก้อนอุกกาบาต: หินกลมขรุขระ ผิวไหม้ดำ มีหลุมอุกกาบาต รอยร้าวเรืองไฟ ขอบร้อนแดง — หมุนควงช้าๆ */}
        <svg
          className="ns-layer ns-rock"
          viewBox="0 0 100 100"
          style={{
            left: -h,
            top: -h,
            width: h * 2,
            height: h * 2,
            overflow: "visible",
            filter: `drop-shadow(0 0 ${h * 0.5}px rgba(255,150,50,.95))${lite ? "" : ` drop-shadow(0 0 ${h * 1.4}px rgba(255,90,20,.6))`}`,
          }}
        >
          <defs>
            <radialGradient id="ns-rg" cx="34%" cy="32%" r="80%">
              <stop offset="0" stopColor="#e9a064" />
              <stop offset=".28" stopColor="#8a4020" />
              <stop offset=".62" stopColor="#3b1a14" />
              <stop offset="1" stopColor="#140809" />
            </radialGradient>
          </defs>
          <path
            d="M50 3 L66 6 L82 16 L93 32 L97 50 L92 68 L82 84 L64 95 L46 97 L28 92 L13 79 L5 60 L6 40 L15 22 L30 9Z"
            fill="url(#ns-rg)"
            stroke="#ff9d3c"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          {/* หลุมอุกกาบาต */}
          <circle cx="36" cy="38" r="11" fill="#1d0c0b" opacity=".65" />
          <circle cx="36" cy="36" r="9" fill="none" stroke="#a85a2c" strokeWidth="1.4" opacity=".7" />
          <circle cx="68" cy="60" r="8" fill="#1d0c0b" opacity=".6" />
          <circle cx="52" cy="78" r="5.5" fill="#1d0c0b" opacity=".55" />
          <circle cx="72" cy="30" r="4" fill="#1d0c0b" opacity=".5" />
          {/* รอยร้าวเรืองไฟ */}
          <path d="M20 62 L34 56 L42 66 L58 58 L66 70 L80 66" fill="none" stroke="#ffb347" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" opacity=".95" />
          <path d="M50 14 L54 28 L46 38 L52 50" fill="none" stroke="#ff8a2a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity=".85" />
        </svg>
      </span>
    </span>
  );
}

const CSS = `
/* ---------- ดาวกระพริบ ---------- */
@keyframes ns-twinkle {
  0%, 100% { opacity: var(--ns-base, 0.3); transform: scale(0.85); }
  50%      { opacity: 1;                   transform: scale(1.25); }
}
.ns-star { animation: ns-twinkle 3s ease-in-out infinite; will-change: opacity, transform; }

/* ---------- ดาวตก / ดาวหาง ---------- */
/* .ns-ev = จุดเริ่ม + หมุนไปตามทิศ | .ns-mover = ตัวที่เลื่อนไปข้างหน้าตามแกน X ของ .ns-ev */
.ns-ev { position: absolute; width: 0; height: 0; transform-origin: 0 0; pointer-events: none; }
.ns-mover {
  position: absolute; left: 0; top: 0; width: 0; height: 0; opacity: 0;
  animation-timing-function: linear; animation-iteration-count: 1; animation-fill-mode: forwards;
  will-change: transform, opacity;
}
.ns-layer { position: absolute; display: block; }
.ns-taper { position: absolute; inset: 0; display: block; clip-path: polygon(0 50%, 100% 0, 100% 100%); }

@keyframes ns-move-s {
  0%   { transform: translateX(0);          opacity: 0; }
  6%   { opacity: 1; }
  72%  { opacity: 1; }
  100% { transform: translateX(var(--d));   opacity: 0; }
}
.ns-mover-s { animation-name: ns-move-s; }

@keyframes ns-move-c {
  0%   { transform: translateX(0);          opacity: 0; }
  5%   { opacity: 1; }
  95%  { opacity: 1; }
  100% { transform: translateX(var(--d));   opacity: 0; }
}
.ns-mover-c { animation-name: ns-move-c; }

/* รอยแสงที่ค้างบนฟ้า: ค่อยๆ เผยตามหัวดาว (เร็วเท่ากัน) แล้วจางช้าๆ */
@keyframes ns-trail {
  0%    { clip-path: inset(0 100% 0 0); opacity: 0.9; }
  58.8% { clip-path: inset(0 0 0 0);    opacity: 0.9; }
  100%  { clip-path: inset(0 0 0 0);    opacity: 0; }
}
.ns-trail {
  position: absolute; left: 0; top: -1px; height: 2px; width: var(--d);
  -webkit-mask-image: linear-gradient(90deg, transparent, #000);
          mask-image: linear-gradient(90deg, transparent, #000);
  animation: ns-trail linear 1 forwards;
}

@keyframes ns-spark {
  0%, 100% { opacity: 0.15; transform: scale(0.6); }
  50%      { opacity: 1;    transform: scale(1.2); }
}
.ns-spark { position: absolute; display: block; border-radius: 9999px; animation: ns-spark 1.2s ease-in-out infinite; }

.ns-flare { position: absolute; display: block; opacity: 0.75; }
.ns-flare-h { height: 1px; }
.ns-flare-v { width: 1px; }
@keyframes ns-pulse { 0%, 100% { opacity: 0.35; } 50% { opacity: 0.95; } }
.ns-pulse { animation: ns-pulse 1.1s ease-in-out infinite; }

/* ---------- กระพริบ / แกว่ง / ไฟลุก ---------- */
@keyframes ns-flick {
  0% { opacity: 1; } 7% { opacity: .72; } 14% { opacity: .98; } 27% { opacity: .8; } 33% { opacity: 1; }
  46% { opacity: .66; } 58% { opacity: .95; } 71% { opacity: .78; } 84% { opacity: 1; } 92% { opacity: .84; } 100% { opacity: 1; }
}
.ns-flick { animation: ns-flick 1.6s linear infinite; }

@keyframes ns-breathe {
  0%, 100% { transform: scale(1, 1); } 22% { transform: scale(1.04, 1.22); }
  47% { transform: scale(.95, .84); } 73% { transform: scale(1.03, 1.12); }
}
.ns-breathe { transform-origin: 100% 50%; animation: ns-breathe 1.7s ease-in-out infinite; }

@keyframes ns-sway {
  0%, 100% { transform: rotate(calc(var(--r) - 2.5deg)) scale(1, 1); }
  50%      { transform: rotate(calc(var(--r) + 3deg)) scale(1.02, 1.2); }
}
.ns-sway { transform-origin: 100% 50%; animation: ns-sway 3.4s ease-in-out infinite; }

@keyframes ns-lick {
  0%, 100% { transform: scale(1, 1) skewY(0deg); } 20% { transform: scale(1.06, 1.18) skewY(2deg); }
  45% { transform: scale(.93, .86) skewY(-2.5deg); } 70% { transform: scale(1.04, 1.1) skewY(1.5deg); }
}
.ns-lick { transform-origin: 100% 50%; animation: ns-lick .6s ease-in-out infinite; }

@keyframes ns-tongue {
  0%, 100% { transform: rotate(var(--r)) scaleX(1); }
  30% { transform: rotate(calc(var(--r) + 7deg)) scaleX(1.18); }
  65% { transform: rotate(calc(var(--r) - 6deg)) scaleX(.78); }
}
.ns-tongue { transform-origin: 100% 50%; animation: ns-tongue .45s ease-in-out infinite; }

@keyframes ns-fire {
  0%, 100% { opacity: .85; transform: scale(1); } 25% { opacity: 1; transform: scale(1.14); }
  55% { opacity: .7; transform: scale(.92); } 80% { opacity: .95; transform: scale(1.08); }
}
.ns-fire { animation: ns-fire .7s ease-in-out infinite; }

@keyframes ns-spin { to { transform: rotate(360deg); } }
.ns-rock { transform-origin: 50% 50%; animation: ns-spin 7s linear infinite; }

/* ---------- อุกกาบาต ---------- */
@keyframes ns-move-m {
  from { transform: translateX(0);        opacity: 1; }
  to   { transform: translateX(var(--d)); opacity: 1; }
}
/* กระพริบแบบนุ่มสำหรับอุกกาบาต: ไม่ให้ไฟวูบจนหาย */
.ns-mover-m .ns-flick { animation-name: ns-flick-soft; }
@keyframes ns-flick-soft {
  0% { opacity: 1; } 20% { opacity: .88; } 40% { opacity: 1; } 62% { opacity: .84; } 80% { opacity: .97; } 100% { opacity: 1; }
}
.ns-mover-m { animation-name: ns-move-m; }

@keyframes ns-life { from { opacity: 0; } to { opacity: 0; } }
.ns-life { position: absolute; width: 0; height: 0; animation: ns-life linear 1 forwards; }

@keyframes ns-smoke {
  0%   { opacity: 0;   transform: translate(0, 0) scale(.3); }
  14%  { opacity: .82; }
  100% { opacity: 0;   transform: translate(var(--sx), var(--sy)) scale(var(--grow)); }
}
.ns-puff {
  position: absolute; display: block; opacity: 0; will-change: transform, opacity;
  border-radius: 62% 38% 55% 45% / 48% 58% 42% 52%;
  background: radial-gradient(circle at 40% 38%, rgba(10,6,20,.95) 0%, rgba(18,12,32,.72) 42%, transparent 72%);
  animation: ns-smoke ease-out 1 both;
}
@keyframes ns-heat { 0% { opacity: .9; } 100% { opacity: 0; } }
.ns-heat {
  position: absolute; inset: 0; display: block; border-radius: 9999px; opacity: 0;
  background: radial-gradient(circle, rgba(255,120,40,.6), transparent 65%);
  animation: ns-heat ease-out 1 both;
}

@keyframes ns-ember {
  0%   { opacity: 0; transform: translate(0, 0) scale(1); }
  8%   { opacity: 1; }
  100% { opacity: 0; transform: translate(var(--sx), var(--sy)) scale(.3); }
}
.ns-ember {
  position: absolute; display: block; border-radius: 9999px; opacity: 0;
  background: #ffb347; box-shadow: 0 0 6px 1px rgba(255,120,30,.9);
  animation: ns-ember ease-out 1 both;
}

/* ---------- ของที่ตกลงมาตอนกลางคืน: เปลี่ยนจากเขียวเข้ม → ม่วงอ่อน/ขาวนวล มีแสงเรือง ---------- */
.fi-night svg [stroke="#059669"],
.fi-night svg [stroke="#047857"],
.fi-night svg [stroke="#10b981"] { stroke: #f3effe; }
.fi-night svg [fill="#10b981"] { fill: #c4b5fd; fill-opacity: 0.42; }
.fi-night svg [fill="#059669"],
.fi-night svg [fill="#047857"] { fill: #ddd6fe; }
.fi-night svg {
  filter: drop-shadow(0 0 5px rgba(196,181,253,0.9)) drop-shadow(0 0 1.5px rgba(255,255,255,0.85));
}
/* เงาพื้น / แสงกระแทก / ฝุ่น / เศษแตก: เปลี่ยนเป็นโทนม่วงสว่าง */
.fi-night .bg-emerald-800\\/25  { background-color: rgba(196,181,253,0.28); }
.fi-night .bg-emerald-400\\/50  { background-color: rgba(196,181,253,0.55); }
.fi-night .border-emerald-400\\/50 { border-color: rgba(233,225,255,0.7); }
.fi-night .bg-emerald-500\\/60  { background-color: rgba(233,225,255,0.85); }
.fi-night .bg-emerald-500\\/50  { background-color: rgba(196,181,253,0.7); }
.fi-night .border-emerald-400\\/60 { border-color: rgba(245,243,255,0.85); }
`;