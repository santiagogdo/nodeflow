export function drawIcon(
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  size: number,
  color: string,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  switch (name) {
    case "database":
      ctx.ellipse(12, 5, 8, 3, 0, 0, Math.PI * 2);
      ctx.moveTo(4, 5);
      ctx.lineTo(4, 19);
      ctx.ellipse(12, 19, 8, 3, 0, Math.PI, 0, true);
      ctx.lineTo(20, 5);
      ctx.moveTo(4, 12);
      ctx.bezierCurveTo(6, 16, 18, 16, 20, 12);
      break;
    case "filter":
      ctx.moveTo(3, 4);
      ctx.lineTo(21, 4);
      ctx.lineTo(14, 12);
      ctx.lineTo(14, 21);
      ctx.lineTo(10, 18);
      ctx.lineTo(10, 12);
      ctx.closePath();
      break;
    case "table":
      ctx.rect(3, 4, 18, 16);
      ctx.moveTo(3, 10);
      ctx.lineTo(21, 10);
      ctx.moveTo(3, 15);
      ctx.lineTo(21, 15);
      ctx.moveTo(10, 10);
      ctx.lineTo(10, 20);
      break;
    case "subgraph":
      ctx.rect(3, 3, 12, 12);
      ctx.moveTo(15, 8);
      ctx.lineTo(21, 8);
      ctx.lineTo(21, 21);
      ctx.lineTo(8, 21);
      ctx.lineTo(8, 15);
      break;
    case "bolt":
      ctx.moveTo(13, 2);
      ctx.lineTo(4, 14);
      ctx.lineTo(11, 14);
      ctx.lineTo(10, 22);
      ctx.lineTo(21, 9);
      ctx.lineTo(13, 9);
      ctx.closePath();
      break;
    case "number":
      ctx.moveTo(9, 3);
      ctx.lineTo(7, 21);
      ctx.moveTo(17, 3);
      ctx.lineTo(15, 21);
      ctx.moveTo(3, 9);
      ctx.lineTo(21, 9);
      ctx.moveTo(3, 15);
      ctx.lineTo(21, 15);
      break;
    case "code":
      ctx.moveTo(8, 5);
      ctx.lineTo(2, 12);
      ctx.lineTo(8, 19);
      ctx.moveTo(16, 5);
      ctx.lineTo(22, 12);
      ctx.lineTo(16, 19);
      break;
    case "controls":
      ctx.moveTo(3, 7);
      ctx.lineTo(21, 7);
      ctx.moveTo(3, 17);
      ctx.lineTo(21, 17);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(9, 7, 3, 0, Math.PI * 2);
      ctx.moveTo(18, 17);
      ctx.arc(15, 17, 3, 0, Math.PI * 2);
      break;
    default:
      ctx.roundRect(4, 3, 16, 18, 2);
      ctx.moveTo(8, 9);
      ctx.lineTo(16, 9);
      ctx.moveTo(8, 14);
      ctx.lineTo(14, 14);
  }
  ctx.stroke();
  ctx.restore();
}
