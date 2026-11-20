(() => {
  const canvas = document.querySelector('#venus');
  if (!canvas) return;

  const gl = canvas.getContext('webgl', { alpha: true, antialias: true, powerPreference: 'low-power' });
  if (!gl) return;

  const vertexSource = `
    attribute vec2 position;
    void main() { gl_Position = vec4(position, 0.0, 1.0); }
  `;

  const fragmentSource = `
    precision highp float;
    uniform vec2 resolution;
    uniform vec2 planetCenter;
    uniform vec2 orientation;
    uniform float planetRadius;
    uniform float spinAngle;
    uniform vec3 lightDirection;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    vec3 rotateX(vec3 v, float a) {
      float c = cos(a), s = sin(a);
      return vec3(v.x, c * v.y - s * v.z, s * v.y + c * v.z);
    }

    vec3 rotateY(vec3 v, float a) {
      float c = cos(a), s = sin(a);
      return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z);
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / resolution;
      float shortSide = min(resolution.x, resolution.y);
      vec2 centered = (uv - planetCenter) * resolution / shortSide;
      float distanceFromCenter = length(centered);
      float d = distanceFromCenter * distanceFromCenter / (planetRadius * planetRadius);

      if (d > 1.0) {
        float halo = exp(-pow((distanceFromCenter / planetRadius - 1.0) / 0.105, 2.0));
        vec3 rimNormal = normalize(vec3(centered / planetRadius, 0.0));
        float sunFacing = pow(max(dot(rimNormal, lightDirection), 0.0), 1.4);
        float star = step(0.9985, hash(floor(gl_FragCoord.xy * 0.5)));
        vec3 glow = vec3(0.34, 0.17, 0.095) * halo * sunFacing * 0.17;
        vec3 starlight = star * vec3(0.34, 0.27, 0.20);
        gl_FragColor = vec4(glow + starlight, halo * sunFacing * 0.13 + star * 0.65);
        return;
      }

      vec2 p = centered / planetRadius;
      float z = sqrt(max(0.0, 1.0 - d));
      vec3 viewNormal = normalize(vec3(p.x, p.y, z));
      vec3 normal = viewNormal;
      normal = rotateX(normal, orientation.y);
      normal = rotateY(normal, orientation.x + spinAngle);
      float longitude = atan(normal.x, normal.z);
      float latitude = asin(clamp(normal.y, -1.0, 1.0));

      float flow = sin(longitude * 4.2 + sin(latitude * 5.0 + longitude * 1.4) * 1.9)
                 + 0.55 * sin(longitude * 8.5 - latitude * 7.0)
                 + 0.26 * sin(longitude * 16.0 + latitude * 12.0)
                 + 0.12 * sin(longitude * 29.0 - latitude * 22.0);
      float clouds = smoothstep(-0.45, 0.72, sin(latitude * 31.0 + flow * 1.25));
      float wisps = sin(longitude * 12.0 + sin(latitude * 12.0) * 2.0) * 0.5 + 0.5;
      vec3 umber = vec3(0.22, 0.105, 0.070);
      vec3 ochre = vec3(0.57, 0.345, 0.225);
      vec3 cream = vec3(0.82, 0.665, 0.485);
      vec3 surface = mix(umber, ochre, smoothstep(-0.55, 0.52, flow * 0.52));
      surface = mix(surface, cream, clouds * (0.30 + wisps * 0.24));

      float diffuse = max(dot(viewNormal, lightDirection), 0.0);
      float light = 0.19 + diffuse * 0.96;
      float terminator = smoothstep(-0.20, 0.75, dot(viewNormal, lightDirection));
      surface *= light;
      surface = mix(surface * 0.62, surface, terminator);
      float rim = pow(1.0 - z, 3.6);
      surface += vec3(0.29, 0.145, 0.075) * rim * 0.7 * smoothstep(-0.08, 0.65, dot(viewNormal, lightDirection));
      float edge = 1.0 - smoothstep(0.955, 1.0, d);
      gl_FragColor = vec4(surface, edge);
    }
  `;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  const vertex = compile(gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertex || !fragment) return;

  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const resolution = gl.getUniformLocation(program, 'resolution');
  const centerUniform = gl.getUniformLocation(program, 'planetCenter');
  const orientationUniform = gl.getUniformLocation(program, 'orientation');
  const radiusUniform = gl.getUniformLocation(program, 'planetRadius');
  const spinUniform = gl.getUniformLocation(program, 'spinAngle');
  const lightUniform = gl.getUniformLocation(program, 'lightDirection');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const motion = { yaw: 0, pitch: 0, yawVelocity: 0, pitchVelocity: 0, spin: 0, direction: 1 };
  const layout = { centerX: 0, centerY: 0, radius: 0, normalizedRadius: 0 };
  const spinSpeed = 0.11;
  let dragging = false;
  let previousPoint = null;
  let frame = 0;
  let previousFrameTime = 0;
  let heroVisible = true;

  function wrapAngle(angle) {
    const fullTurn = Math.PI * 2;
    return ((angle + Math.PI) % fullTurn + fullTurn) % fullTurn - Math.PI;
  }

  function resize() {
    const scale = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = Math.max(1, Math.floor(canvas.clientWidth * scale));
    const height = Math.max(1, Math.floor(canvas.clientHeight * scale));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }

    const shortSide = Math.min(canvas.clientWidth, canvas.clientHeight);
    const mobile = canvas.clientWidth <= 700;
    layout.centerX = mobile ? canvas.clientWidth * 0.64 : canvas.clientWidth * 0.765;
    layout.centerY = mobile ? canvas.clientHeight * 0.60 : canvas.clientHeight * 0.50;
    layout.radius = mobile
      ? Math.min(canvas.clientWidth * 0.39, canvas.clientHeight * 0.40)
      : Math.min(shortSide * 0.405, canvas.clientWidth * 0.45, canvas.clientHeight * 0.45);
    layout.normalizedRadius = layout.radius / shortSide;

    gl.uniform2f(centerUniform, layout.centerX / canvas.clientWidth, 1 - layout.centerY / canvas.clientHeight);
    gl.uniform1f(radiusUniform, layout.normalizedRadius);
  }

  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (Math.hypot(x - layout.centerX, y - layout.centerY) > layout.radius * 1.12) return;
    dragging = true;
    previousPoint = { x: event.clientX, y: event.clientY, time: performance.now() };
    motion.yawVelocity = 0;
    motion.pitchVelocity = 0;
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  canvas.addEventListener('pointermove', event => {
    if (!dragging || !previousPoint) return;
    const now = performance.now();
    const elapsed = Math.max(0.008, Math.min(0.06, (now - previousPoint.time) / 1000));
    const yawChange = (previousPoint.x - event.clientX) * 0.0065;
    const pitchChange = (previousPoint.y - event.clientY) * 0.0065;
    motion.yaw += yawChange;
    motion.pitch = wrapAngle(motion.pitch + pitchChange);
    motion.yawVelocity = yawChange / elapsed;
    motion.pitchVelocity = pitchChange / elapsed;
    previousPoint = { x: event.clientX, y: event.clientY, time: now };
  });

  function releasePointer() {
    if (dragging && Math.abs(motion.yawVelocity) > 0.035) {
      motion.direction = Math.sign(motion.yawVelocity);
    }
    dragging = false;
    previousPoint = null;
  }

  canvas.addEventListener('pointerup', releasePointer);
  canvas.addEventListener('pointercancel', releasePointer);
  canvas.addEventListener('lostpointercapture', releasePointer);
  canvas.addEventListener('keydown', event => {
    const turns = { ArrowLeft: [0.12, 0], ArrowRight: [-0.12, 0], ArrowUp: [0, 0.12], ArrowDown: [0, -0.12] };
    const turn = turns[event.key];
    if (!turn) return;
    event.preventDefault();
    motion.yaw += turn[0];
    motion.pitch = wrapAngle(motion.pitch + turn[1]);
    if (turn[0]) motion.direction = Math.sign(turn[0]);
  });

  function render(now) {
    resize();
    const elapsed = previousFrameTime ? Math.min((now - previousFrameTime) / 1000, 0.05) : 0;
    previousFrameTime = now;
    if (!dragging && elapsed) {
      const damping = reducedMotion.matches ? 8 : 2.35;
      motion.yaw += motion.yawVelocity * elapsed;
      motion.yawVelocity *= Math.exp(-damping * elapsed);
      motion.pitchVelocity += (-motion.pitch * 1.55 - motion.pitchVelocity * 2.5) * elapsed;
      motion.pitch = wrapAngle(motion.pitch + motion.pitchVelocity * elapsed);
      if (Math.abs(motion.yawVelocity) < 0.003) motion.yawVelocity = 0;
      if (Math.abs(motion.pitchVelocity) < 0.003) motion.pitchVelocity = 0;
      if (!reducedMotion.matches) motion.spin += spinSpeed * motion.direction * elapsed;
    }

    gl.uniform2f(resolution, canvas.width, canvas.height);
    gl.uniform2f(orientationUniform, motion.yaw, motion.pitch);
    gl.uniform1f(spinUniform, motion.spin);
    gl.uniform3f(lightUniform, -0.505, 0.422, 0.753);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    if (heroVisible && !document.hidden) frame = window.requestAnimationFrame(render);
  }

  resize();
  window.addEventListener('resize', resize, { passive: true });
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(([entry]) => {
      heroVisible = entry.isIntersecting;
      if (!heroVisible || document.hidden) window.cancelAnimationFrame(frame);
      else {
        previousFrameTime = performance.now();
        frame = window.requestAnimationFrame(render);
      }
    }, { threshold: 0.01 });
    observer.observe(canvas);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) window.cancelAnimationFrame(frame);
    else if (heroVisible) {
      previousFrameTime = performance.now();
      frame = window.requestAnimationFrame(render);
    }
  });
  frame = window.requestAnimationFrame(render);
})();
