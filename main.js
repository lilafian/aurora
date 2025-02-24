class SystemTerminal {
    constructor(id) {
        this.id = id;
        this.element = document.createElement("p");
        this.element.id = id;
        this.api = {
            init: () => {
                this.element.className = "system-terminal";
                document.body.appendChild(this.element);
            },
            log: (msg) => {
                this.element.innerText += msg;
            },
            destroy: () => {
                this.element.remove();
            }
        };
    }
}

class ExecutableProgram {
    constructor(name, version) {
        this.name = name;
        this.version = version;
        this.exec = null;
        this.api = {
            compileFromFunction: (func) => {
                this.exec = func;
            },
            execute: (services) => {
                this.exec(services);
            }
        };
    }
}

class SystemKernel {
    constructor(name, version) {
        this.name = name;
        this.version = version;
        this.api = {
            init: (terminal) => {
                this.terminal = terminal;
                this.terminal.api.log(`${name} kernel v${version} started\n`);
                this.terminal.api.log(`Changing id of terminal ${this.terminal.id} to ${this.name}-kernelt\n`);
                this.terminal.id = `${this.name}-kernelt`;
                this.terminal.api.log(`Kernel terminal is now ${this.terminal.id}\n`);
            }
        };
        this.services = {

        }
    }
}

class SystemLoader {
    constructor(kernel, name, version) {
        this.kernel = kernel
        this.name = name;
        this.version = version;
        this.terminal = new SystemTerminal(`${name}-systemloadert`);
        this.api = {
            boot: () => {
                this.terminal.api.init();
                this.terminal.api.log(`${this.name} v${this.version}\n`);
                this.terminal.api.log(`Loading kernel ${this.kernel.name} (version ${this.kernel.version})\n`);
                this.kernel.api.init(this.terminal);
            }
        };
    }
}

const AuroraSystemKernel = new SystemKernel("Aurora", "0.1.0");
const AuroraSystemLoader = new SystemLoader(AuroraSystemKernel, "AuroraSysLoader", "0.1.0");
AuroraSystemLoader.api.boot();
