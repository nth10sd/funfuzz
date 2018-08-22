//DDBEGIN
var lfModule = new WebAssembly.Module(wasmTextToBinary(`
    (module
        (import "global" "func" (result i32))
        (func (export "func_0") (result i32)
         call 0
        )
    )
`));
processModule(lfModule, `
  verifyprebarriers()
`);
function processModule(module, jscode) {
    imports = {}
    for (let descriptor of WebAssembly.Module.imports(module)) {
        imports[descriptor.module] = {}
        imports[descriptor.module][descriptor.name] = new Function(jscode);
        instance = new WebAssembly.Instance(module, imports);
        for (let descriptor of WebAssembly.Module.exports(module))
            instance.exports[descriptor.name]()
    }
// This line should be reduced away
}
//DDEND
