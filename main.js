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

class Service {
    constructor(name, version, kernel, api) {
        this.name = name;
        this.version = version;
        this.kernel = kernel;
        this.api = api || {};
    }
}

class Process { 
    constructor(application, pid, memoryOffset, services) {
        this.application = application;
        this.pid = pid;
        this.processMemory = {
            globalOffset: memoryOffset,
            content: []
        };
        this.services = services;
        this.api = {
            writeMemory: (index, content) => {
                this.processMemory.content[index] = content;
                this.services.memoryrws.api.syncProcessMemoryToGlobal(this);
            },
            readMemory: (index) => {
                return this.processMemory.content[index];
            }
        };
    }
}

class Application {
    constructor(name, version) {
        this.name = name;
        this.version = version;
        this.exec = null;
        this.api = {
            createExecutableFromFunction: (func) => {
                this.exec = func;
            }
        };
    }
}

class SystemKernel {
    constructor(name, version) {
        this.name = name;
        this.version = version;
        this.globalMemory = [];
        this.registeredServices = {};
        this.runningProcesses = [];
        this.nextPID = 0;
        this.nextGMemOffset = 0;

        this.api = {
            registerService: (service) => {
                this.registeredServices[service.name] = service;
            },
            createServices: () => {
                this.terminal.api.log("Creating service memoryrws\n");
                const memoryrws = new Service("memoryrws", "0.1.0", this, {
                    syncProcessMemoryToGlobal: (process) => {
                        this.globalMemory[process.processMemory.globalOffset] = process.processMemory.content;
                    },
                    syncProcessMemoryFromGlobal: (process) => {
                        process.processMemory.content = this.globalMemory[process.processMemory.globalOffset];
                    },
                    writeProcessMemory: (process, index, content) => {
                        this.globalMemory[process.processMemory.globalOffset] = process.processMemory.content;
                        this.globalMemory[process.processMemory.globalOffset][index] = content;
                        process.processMemory.content = this.globalMemory[process.processMemory.globalOffset];
                    },
                    readProcessMemory: (process, index) => {
                        this.globalMemory[process.processMemory.globalOffset] = process.processMemory.content;
                        return this.globalMemory[process.processMemory.globalOffset][index]
                    }
                });
                this.api.registerService(memoryrws);
                
                this.terminal.api.log("Creating service kterminals\n");
                const kterminals = new Service("kterminals", "0.1.0", this, {
                    log: (msg) => {
                        this.terminal.api.log(msg);
                    }
                });
                this.api.registerService(kterminals);

                this.terminal.api.log("Creating service processmgrs\n");
                const processmgrs = new Service("processmgrs", "0.1.0", this, {
                    createProcess: (application) => {
                        this.api.createProcess(application); // kernel method, not service method
                    },
                    runProcess: (process) => {
                        this.api.runProcess(process); // kernel method, not service method
                    }
                });
                this.api.registerService(processmgrs);

                this.terminal.api.log("Creating service servicemgrs\n");
                const servicemgrs = new Service("servicemgrs", "0.1.0", this, {
                    
                });
            },
            createProcess: (application) => {
                const newProcess = new Process(application, this.nextPID, this.nextGMemOffset, this.registeredServices);
                this.nextPID++;
                this.nextGMemOffset++;
                return newProcess;
            },
            runProcess: (process) => {
                process.application.exec(process, this.registeredServices);

                this.runningProcesses.push(process);
            },
            init: (terminal) => {
                this.terminal = terminal;
                this.terminal.api.log(`${name} kernel v${version} started\n`);
                this.terminal.api.log(`Changing id of terminal ${this.terminal.id} to ${this.name}-kernelt\n`);
                this.terminal.id = `${this.name}-kernelt`;
                this.terminal.api.log(`Kernel terminal is now ${this.terminal.id}\n`);

                this.api.createServices();
                for (let i in this.registeredServices) {
                    this.terminal.api.log(`Service ${this.registeredServices[i].name} is registered\n`);
                }

                const testApplication = new Application("test", "1.0.0");
                testApplication.api.createExecutableFromFunction((process, services) => {
                    process.api.writeMemory(0, "Memory works\n");
                    const text = services.memoryrws.api.readProcessMemory(process, 0);
                    services.kterminals.api.log(text);
                });

                this.terminal.api.log("Testing memory\n");

                const testProcess = this.api.createProcess(testApplication);
                this.api.startProcess(testProcess);
            }
        };
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
