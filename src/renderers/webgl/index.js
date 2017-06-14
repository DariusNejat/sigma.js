/**
 * Sigma.js WebGL Renderer
 * ========================
 *
 * File implementing sigma's WebGL Renderer.
 */
import {mat3} from 'gl-matrix';

import Renderer from '../../renderer';
import Camera from '../../camera';
import NodeProgram from './programs/node';
import EdgeProgram from './programs/edge';

import drawLabel from '../canvas/components/label';
import drawHover from '../canvas/components/hover';

import MouseCaptor from '../../captors/mouse';

import {
  createElement,
  getPixelRatio
} from '../utils';

import {
  matrixFromCamera
} from './utils';

/**
 * Constants.
 */
const WEBGL_OVERSAMPLING_RATIO = 2;
const PIXEL_RATIO = getPixelRatio();

// TODO: autorescale should be a factory function with dimensions and boundaries => conversion (can use the camera)

// TODO: test the color pixel map for hover, or a raycaster
// TODO: check bufferSubData
// TODO: possibility to bypass need for quadtree when every node fits in
// TODO: rescale layout
// TODO: draw hover should be an activable method

// TODO: give all the bricks to create your own renderer easily
// TODO: expose the captors etc.
// TODO: show minimalist renderers (canvas for instance), so that anyone may do it
// TODO: delegate render to renderer avoid refresh on sigma
// TODO: create a minimalistic renderer using canvas or d3

// TODO: might be possible to use a canvas camera for the canvas renderer
// TODO: camera should be created in the constructor rather than in #.bind
// TODO: should sigma be the one to refresh?
// TODO: renderer can be a class or a mere function if needed

// TODO: should not buffer data each time it seems
// TODO: should react to the graph updates obviously :)

// TODO: should try the method without if and oversampling found for the nodes

// TODO: we should check the pixel opacity before attempting to use the quad

/**
 * Main class.
 *
 * @constructor
 * @param {HTMLElement} container - The graph's container.
 */
export default class WebGLRenderer extends Renderer {
  constructor(container) {
    super();

    // Validating
    if (!(container instanceof HTMLElement))
      throw new Error('sigma/renderers/webgl: container should be an html element.');

    // Properties
    this.sigma = null;
    this.captors = {};
    this.container = container;
    this.elements = {};
    this.contexts = {};

    this.nodeArray = null;
    this.nodeIndicesArray = null;
    this.edgeArray = null;
    this.edgeIndicesArray = null;

    this.nodePrograms = {
      def: new NodeProgram()
    };
    this.edgePrograms = {
      def: new EdgeProgram()
    };

    // Starting dimensions
    this.width = 0;
    this.height = 0;

    // Initializing contexts
    this.createContext('edges');
    this.createContext('nodes');
    this.createContext('labels', false);
    this.createContext('mouse', false);

    // Initial resize
    this.resize();

    // Initializing the camera
    this.camera = new Camera({
      width: this.width,
      height: this.height
    });

    // Binding camera events
    this.bindCameraHandlers();

    // Initializing captors
    this.captors = {
      mouse: new MouseCaptor(this.elements.mouse, this.camera)
    };

    // Loading programs
    for (const k in this.nodePrograms)
      this.nodePrograms[k].load(this.contexts.nodes);

    for (const k in this.edgePrograms)
      this.edgePrograms[k].load(this.contexts.edges);
  }

  /**---------------------------------------------------------------------------
   * Internal methods.
   **---------------------------------------------------------------------------
   */

  /**
   * Internal function used to create a canvas context and add the relevant
   * DOM elements.
   *
   * @param  {string}  id    - Context's id.
   * @param  {boolean} webgl - Whether the context is a webgl or canvas one.
   * @return {WebGLRenderer}
   */
  createContext(id, webgl = true) {
    const element = createElement('canvas', {
      class: `sigma-${id}`,
      style: {
        position: 'absolute'
      }
    });

    this.elements[id] = element;
    this.container.appendChild(element);

    const contextOptions = {
      preserveDrawingBuffer: true
    };

    const context = element.getContext(webgl ? 'webgl' : '2d', contextOptions);

    this.contexts[id] = context;

    return this;
  }

  /**
   * Function binding camera handlers.
   *
   * @return {WebGLRenderer}
   */
  bindCameraHandlers() {
    this.camera.on('updated', () => {
      this.sigma.scheduleRefresh();
    });

    return this;
  }

  /**
   * Function used to process the whole graph's data.
   *
   * @return {WebGLRenderer}
   */
  process() {

    const graph = this.sigma.getGraph();

    const nodeProgram = this.nodePrograms.def;

    this.nodeArray = new Float32Array(
      NodeProgram.POINTS * NodeProgram.ATTRIBUTES * graph.order
    );

    const nodes = graph.nodes();

    for (let i = 0, l = nodes.length; i < l; i++) {
      const node = nodes[i];

      const data = this.sigma.getNodeData(node);

      nodeProgram.process(
        this.nodeArray,
        data,
        i * NodeProgram.POINTS * NodeProgram.ATTRIBUTES
      );
    }

    const edgeProgram = this.edgePrograms.def;

    this.edgeArray = new Float32Array(
      EdgeProgram.POINTS * EdgeProgram.ATTRIBUTES * graph.size
    );

    const edges = graph.edges();

    for (let i = 0, l = edges.length; i < l; i++) {
      const edge = edges[i];

      const data = this.sigma.getEdgeData(edge),
            extremities = graph.extremities(edge),
            sourceData = this.sigma.getNodeData(extremities[0]),
            targetData = this.sigma.getNodeData(extremities[1]);

      edgeProgram.process(
        this.edgeArray,
        sourceData,
        targetData,
        data,
        i * EdgeProgram.POINTS * EdgeProgram.ATTRIBUTES
      );

      if (typeof edgeProgram.computeIndices === 'function')
        this.edgeIndicesArray = edgeProgram.computeIndices(this.edgeArray);
    }

    return this;
  }

  /**---------------------------------------------------------------------------
   * Public API.
   **---------------------------------------------------------------------------
   */

  /**
   * Function used to bind the renderer to a sigma instance.
   *
   * @param  {Sigma} sigma - Target sigma instance.
   * @return {WebGLRenderer}
   */
  bind(sigma) {

    // Binding instance
    this.sigma = sigma;

    // Processing initial data
    this.process();

    return this;
  }

  /**
   * Function used to resize the renderer.
   *
   * @param  {number} width  - Target width.
   * @param  {number} height - Target height.
   * @return {WebGLRenderer}
   */
  resize(width, height) {
    const previousWidth = this.width,
          previousHeight = this.height;

    if (arguments.length > 1) {
      this.width = width;
      this.height = height;
    }
    else {
      this.width = this.container.offsetWidth;
      this.height = this.container.offsetHeight;
    }

    // If nothing has changed, we can stop right here
    if (previousWidth === this.width && previousHeight === this.height)
      return this;

    // Sizing dom elements
    for (const id in this.elements) {
      const element = this.elements[id];

      element.style.width = this.width + 'px';
      element.style.height = this.height + 'px';
    }

    // Sizing contexts
    for (const id in this.contexts) {
      const context = this.contexts[id];

      // Canvas contexts
      if (context.scale) {
        this.elements[id].setAttribute('width', (this.width * PIXEL_RATIO) + 'px');
        this.elements[id].setAttribute('height', (this.height * PIXEL_RATIO) + 'px');

        if (PIXEL_RATIO !== 1)
          context.scale(PIXEL_RATIO, PIXEL_RATIO);
      }

      // WebGL contexts
      else {
        this.elements[id].setAttribute('width', (this.width * WEBGL_OVERSAMPLING_RATIO) + 'px');
        this.elements[id].setAttribute('height', (this.height * WEBGL_OVERSAMPLING_RATIO) + 'px');
      }

      if (context.viewport) {
        context.viewport(
          0,
          0,
          this.width * WEBGL_OVERSAMPLING_RATIO,
          this.height * WEBGL_OVERSAMPLING_RATIO
        );
      }
    }

    return this;
  }

  /**
   * Function used to clear the canvases.
   *
   * @return {WebGLRenderer}
   */
  clear() {
    let context = this.contexts.nodes;
    context.clear(context.COLOR_BUFFER_BIT);

    context = this.contexts.edges;
    context.clear(context.COLOR_BUFFER_BIT);

    context = this.contexts.labels;
    context.clearRect(0, 0, this.width, this.height);

    return this;
  }

  /**
   * Function used to render.
   *
   * @return {WebGLRenderer}
   */
  render() {

    // First we need to resize
    this.resize();

    // Clearing the canvases
    this.clear();

    // Then we need to extract a matrix from the camera
    const cameraState = this.camera.getState(),
          cameraMatrix = matrixFromCamera(cameraState);

    const translation = mat3.fromTranslation(mat3.create(), [
      this.width / 2,
      this.height / 2
    ]);

    mat3.multiply(cameraMatrix, translation, cameraMatrix);

    let program,
        gl;

    // Drawing nodes
    gl = this.contexts.nodes;
    program = this.nodePrograms.def;

    // Blending
    // TODO: check the purpose of this
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.BLEND);

    // TODO: should probably use another name for the `program` abstraction
    program.render(
      gl,
      this.nodeArray,
      {
        matrix: cameraMatrix,
        width: this.width,
        height: this.height,
        ratio: cameraState.ratio,
        nodesPowRatio: 0.5,
        scalingRatio: WEBGL_OVERSAMPLING_RATIO
      }
    );

    // Drawing edges
    gl = this.contexts.edges;
    program = this.edgePrograms.def;

    program.render(
      gl,
      this.edgeArray,
      {
        matrix: cameraMatrix,
        width: this.width,
        height: this.height,
        ratio: cameraState.ratio,
        edgesPowRatio: 0.5,
        scalingRatio: WEBGL_OVERSAMPLING_RATIO,
        indices: this.edgeIndicesArray
      }
    );

    // Drawing labels
    // TODO: POW RATIO is currently default 0.5 and harcoded
    const nodes = this.sigma.getGraph().nodes(),
          context = this.contexts.labels;

    const sizeRatio = Math.pow(cameraState.ratio, 0.5);

    for (let i = 0, l = nodes.length; i < l; i++) {
      const data = this.sigma.getNodeData(nodes[i]);

      const {x, y} = this.camera.graphToDisplay(data.x, data.y);

      // TODO: we can cache the labels we need to render until the camera's ratio changes
      const size = data.size / sizeRatio;

      // TODO: this is the label threshold hardcoded
      if (size < 8)
        continue;

      drawLabel(context, {
        label: data.label,
        size,
        x,
        y
      });
    }

    return this;
  }
}