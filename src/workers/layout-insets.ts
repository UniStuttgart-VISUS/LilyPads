import * as d3 from 'd3';

const layout: Worker = self as any;

// Respond to message from parent thread
layout.onmessage = (ev: MessageEvent) => {
  layoutInsets(
    ev.data.real_nodes,
    ev.data.max_dist,
    ev.data.cluster_radius,
    ev.data.outerRadius,
    ev.data.scale
  );
};

function layoutInsets(real_nodes: Array<any>, max_dist: number, cluster_radius: number, outerRadius: number, scale: number) {
  console.time('worker: layout insets');
  const ghost_nodes = real_nodes.map((d,i) => {
    return {
      x: d.x - (50 + cluster_radius) * Math.cos(d.gca.alpha),
      y: d.y - (50 + cluster_radius) * Math.sin(d.gca.alpha),
      radius: 50,
      type: 'ghost',
      id: 'ghost-' + i
    };
  }).map(function(d: any) {
    d.fx = d.x;
    d.fy = d.y;
    return d;
  });

  const nodes = real_nodes.concat(ghost_nodes);

  // repelling force
  const collisionForce = d3.forceCollide<any>()
    .radius(d => d.radius+5)
    .strength(1);

  d3.forceSimulation(nodes)
    .alphaDecay(1 - Math.pow(0.001, 1/40))
    .force('collide', collisionForce)
    .on('tick', function() {
      real_nodes.forEach(d => {
        const alpha = Math.atan2(d.y, d.x);
        const delta = outerRadius + scale * d.gca.distance;
        d.x = Math.cos(alpha) * delta;
        d.y = Math.sin(alpha) * delta;
      }, this);
      // update ghost node positions
      ghost_nodes.forEach((d, i) => {
        const node = real_nodes[i];
        const alpha = Math.atan2(node.y, node.x);
        d.x = node.x - Math.cos(alpha) * (cluster_radius+d.radius);
        d.y = node.y - Math.sin(alpha) * (cluster_radius+d.radius);
        d.fx = d.x;
        d.fy = d.y;
      }, this);
    })
    .on('end', function() {
      console.timeEnd('worker: layout insets');
      layout.postMessage({
        clusters: real_nodes.map(d => {
          delete d.type;
          delete d.vx;
          delete d.vy;
          d.alpha = Math.atan2(-d.y, -d.x);
          return d;
        }),
        scale: scale,
        max_dist: max_dist
      });
    });

}
