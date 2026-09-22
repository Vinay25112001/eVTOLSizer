import { appVersionLabel } from "./designfile.js";
export function capturePanel(containerRef, title){
  try{
    const container = containerRef.current;
    if(!container) return;
    const svg = container.querySelector("svg");
    if(!svg){ alert("No chart found in this panel."); return; }

    // ── Inline computed styles so the clone is fully self-contained ──
    const srcEls  = svg.querySelectorAll("*");
    const clone   = svg.cloneNode(true);
    const destEls = clone.querySelectorAll("*");
    srcEls.forEach((src,i)=>{
      const cs  = window.getComputedStyle(src);
      const dst = destEls[i];
      ["fill","fill-opacity","stroke","stroke-width","stroke-dasharray",
       "stroke-opacity","font-size","font-family","font-weight",
       "text-anchor","dominant-baseline","opacity",
      ].forEach(p=>{ const v=cs.getPropertyValue(p); if(v) dst.style[p]=v; });
    });
    clone.setAttribute("xmlns","http://www.w3.org/2000/svg");

    // ── Serialize SVG → blob URL → Image ──
    const svgStr  = new XMLSerializer().serializeToString(clone);
    const svgBlob = new Blob([svgStr],{type:"image/svg+xml;charset=utf-8"});
    const svgUrl  = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = ()=>{
      // Header strip height (drawn above the chart)
      const HEADER = 56;
      const PAD    = 16;           // left/right padding
      const FOOTER = 22;
      const svgW   = img.naturalWidth  || 800;
      const svgH   = img.naturalHeight || 400;

      // Final canvas size — 2× for retina
      const W = svgW  + PAD * 2;
      const H = svgH  + HEADER + FOOTER;
      const canvas  = document.createElement("canvas");
      canvas.width  = W * 2;
      canvas.height = H * 2;
      const ctx = canvas.getContext("2d");
      ctx.scale(2, 2);

      // ── Background ──
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, W, H);

      // ── Header bar (slightly lighter strip) ──
      ctx.fillStyle = "#111827";
      ctx.fillRect(0, 0, W, HEADER - 4);

      // ── Title ──
      ctx.fillStyle   = "#f59e0b";
      ctx.font        = "bold 13px 'DM Mono',monospace,sans-serif";
      ctx.textBaseline= "top";
      ctx.fillText(title.slice(0, 90), PAD, 10);

      // ── Meta subtitle ──
      const now = new Date().toLocaleString();
      ctx.fillStyle = "#64748b";
      ctx.font      = "10px 'DM Mono',monospace,sans-serif";
      ctx.fillText(`eVTOL Sizer ${appVersionLabel()}  ·  ${now}`, PAD, 30);

      // ── Divider line ──
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(0, HEADER - 4);
      ctx.lineTo(W, HEADER - 4);
      ctx.stroke();

      // ── Draw the real chart SVG below the header ──
      ctx.drawImage(img, PAD, HEADER, svgW, svgH);

      // ── Footer watermark ──
      ctx.fillStyle   = "#334155";
      ctx.font        = "9px monospace";
      ctx.textBaseline= "bottom";
      ctx.textAlign   = "right";
      ctx.fillText("Wright State University — eVTOL Sizing Framework", W - PAD, H - 4);
      ctx.textAlign = "left";

      URL.revokeObjectURL(svgUrl);

      canvas.toBlob(blob=>{
        if(!blob) return;
        const pngUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const safe = title.replace(/[^a-z0-9_]/gi,"_").slice(0,60);
        a.href = pngUrl;
        a.download = `eVTOL_${safe}.png`;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        setTimeout(()=>URL.revokeObjectURL(pngUrl), 3000);
      }, "image/png");
    };
    img.onerror = ()=>{ URL.revokeObjectURL(svgUrl); alert("PNG export failed — try right-clicking the chart and saving the image directly."); };
    img.src = svgUrl;
  }catch(err){
    console.warn("capturePanel error:",err);
  }
}
