/* Web Worker chạy AI để không làm đơ giao diện */
importScripts('/shared/xiangqi.js', '/shared/ai.js');
self.onmessage = function (e) {
  var d = e.data;
  var r = self.XiangqiAI.bestMove(d.fen, d.level, d.opts);
  self.postMessage({ id: d.id, kind: d.kind, move: r });
};
