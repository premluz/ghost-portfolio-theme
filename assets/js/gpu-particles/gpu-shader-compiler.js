/**
 * GPU Shader Compiler
 * Loads WGSL shader source files and compiles them to WebGPU shader modules
 */

class GPUShaderCompiler {
  constructor(device) {
    this.device = device;
    this.shaderCache = new Map(); // Cache compiled modules
  }

  /**
   * Load shader source from file path
   * @param {string} path - Path to .wgsl file (e.g., '/assets/shaders/compute-particles.wgsl')
   * @returns {Promise<string>} Shader source code
   */
  async loadShaderSource(path) {
    try {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`Failed to load shader: ${response.statusText}`);
      }
      return await response.text();
    } catch (error) {
      console.error(`[GPUShaderCompiler] Failed to load ${path}:`, error);
      throw error;
    }
  }

  /**
   * Compile WGSL source to WebGPU shader module
   * @param {string} source - WGSL code
   * @param {string} label - Debug label for the shader
   * @returns {GPUShaderModule}
   */
  compileShader(source, label = 'unnamed') {
    try {
      const module = this.device.createShaderModule({
        code: source,
        label: `Shader:${label}`
      });
      console.log(`[GPUShaderCompiler] ✅ Compiled shader: ${label}`);
      return module;
    } catch (error) {
      console.error(`[GPUShaderCompiler] ❌ Failed to compile ${label}:`, error);
      throw error;
    }
  }

  /**
   * Load and compile shader in one step
   * @param {string} path - Path to .wgsl file
   * @param {string} label - Debug label
   * @returns {Promise<GPUShaderModule>}
   */
  async loadAndCompile(path, label = 'unnamed') {
    // Check cache first
    if (this.shaderCache.has(label)) {
      console.log(`[GPUShaderCompiler] 📦 Using cached shader: ${label}`);
      return this.shaderCache.get(label);
    }

    // Load source
    const source = await this.loadShaderSource(path);

    // Compile
    const module = this.compileShader(source, label);

    // Cache
    this.shaderCache.set(label, module);

    return module;
  }

  /**
   * Compile multiple shaders at once
   * @param {Object} shaderMap - { label: path, ... }
   * @returns {Promise<Object>} { label: module, ... }
   */
  async loadAndCompileMultiple(shaderMap) {
    const results = {};
    const promises = Object.entries(shaderMap).map(async ([label, path]) => {
      results[label] = await this.loadAndCompile(path, label);
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * Clear shader cache
   */
  clearCache() {
    this.shaderCache.clear();
    console.log('[GPUShaderCompiler] Cache cleared');
  }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
  window.GPUShaderCompiler = GPUShaderCompiler;
}
