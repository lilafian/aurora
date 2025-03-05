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
    constructor(name, version, api) {
        this.name = name;
        this.version = version;
        this.api = api || {};
    }
}

class Status {
    static ACTIVE = new Status("active");
    static INACTIVE = new Status("inactive");
    static TERMINATED = new Status("terminated");

    constructor(value) {
        this.value = value;
    }
    
    static fromValue(value) {
        return Object.values(Status).find(status => status.value === value);
    }
    
    toString() {
        return `Status.${this.value}`;
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
        this.status = Status.INACTIVE;
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

    toString() {
        return `Process ${this.application.name}#${this.pid}`;
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
    constructor(name, version, api) {
        this.name = name;
        this.version = version;
        this.globalMemory = [];
        this.registeredServices = {};
        this.runningProcesses = {};
        this.nextPID = 0;
        this.nextGMemOffset = 0;

        this.api = api || {
            registerService: (service) => {
                this.registeredServices[service.name] = service;
            },
            createMemoryRWService: () => {
                this.terminal.api.log("Creating service memoryrws\n");
                const memoryrws = new Service("memoryrws", "0.1.0", {
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
            },
            createKTerminalService: () => {
                this.terminal.api.log("Creating service kterminals\n");
                const kterminals = new Service("kterminals", "0.1.0", {
                    log: (msg) => {
                        this.terminal.api.log(msg);
                    }
                });
                this.api.registerService(kterminals);
            },
            createProcessMgrService: () => {
                this.terminal.api.log("Creating service processmgrs\n");
                const processmgrs = new Service("processmgrs", "0.1.0", {
                    createProcess: (application) => {
                        return this.api.createProcess(application); // kernel method, not service method
                    },
                    startProcess: (process) => {
                        this.api.startProcess(process); // kernel method, not service method
                    },
                    getRunningProcesses: () => {
                        return this.runningProcesses;
                    },
                    getNextAvailablePID: () => {
                        return this.nextPID;
                    }
                });
                this.api.registerService(processmgrs);
            },
            createGraphicsMgrService: () => {
                this.terminal.api.log("Creating service graphicsmgrs\n");
                const graphicsmgrs = new Service("graphicsmgrs", "0.1.0", {
                    
                });
                this.api.registerService(graphicsmgrs);
            },
            createServices: () => {
                this.api.createMemoryRWService();
                this.api.createKTerminalService();
                this.api.createProcessMgrService();
                this.api.createGraphicsMgrService();
            },
            createProcess: (application) => {
                const newProcess = new Process(application, this.nextPID, this.nextGMemOffset, this.registeredServices);
                this.nextPID++;
                this.nextGMemOffset++;
                return newProcess;
            },
            startProcess: (process) => {
                if (process.status != Status.INACTIVE) {
                    return;
                }
                process.status = Status.ACTIVE;
                process.application.exec(process, this.registeredServices);

                this.runningProcesses[`${process.application.name}#${process.pid}`] = process;
            },
            startTests: () => {
                const memTestApplication = new Application("memtest", "1.0.0");
                memTestApplication.api.createExecutableFromFunction((process, services) => {
                    process.api.writeMemory(0, "Memory is readable and writable\n");
                    const text = services.memoryrws.api.readProcessMemory(process, 0);
                    services.kterminals.api.log(text);
                });

                this.terminal.api.log("\nTesting memory (if there is no output, memoryrws is malfunctioned)\n");

                const memTestProcess = this.api.createProcess(memTestApplication);
                this.api.startProcess(memTestProcess);

                const procTestApplication = new Application("proctest", "1.0.0");
                procTestApplication.api.createExecutableFromFunction((process, services) => {
                    const procTest2Application = new Application("proctest2", "1.0.0");
                    procTest2Application.api.createExecutableFromFunction((process2, services2) => {
                        const runningProcesses = services.processmgrs.api.getRunningProcesses();
                        for (let proc in runningProcesses) {
                            services.kterminals.api.log(`${proc}\n`);
                        }
                        services.kterminals.api.log("exiting procTest2Application.exec\n");
                    });
                    const procTest2Process = services.processmgrs.api.createProcess(procTest2Application);
                    services.processmgrs.api.startProcess(procTest2Process);
                    const runningProcesses = services.processmgrs.api.getRunningProcesses();
                    for (let proc in runningProcesses) {
                        services.kterminals.api.log(`${proc}\n`);
                    }
                    services.kterminals.api.log(`self (procTestApplication.exec) is ${process}\n`);
                    services.kterminals.api.log(`next available PID is ${services.processmgrs.api.getNextAvailablePID()}\n`);

                    services.kterminals.api.log("Process management works");
                });

                this.terminal.api.log("\nTesting process management (if there is no output, processmgrs is malfunctioned)\n");

                const procTestProcess = this.api.createProcess(procTestApplication);
                this.api.startProcess(procTestProcess);

            },
            init: (terminal) => {
                this.terminal = terminal;
                this.terminal.api.log(`${name} kernel v${version} started\n\n`);
                this.terminal.api.log(`Changing id of terminal ${this.terminal.id} to ${this.name}-kernelt\n`);
                this.terminal.id = `${this.name}-kernelt`;
                this.terminal.api.log(`Kernel terminal is now ${this.terminal.id}\n\n`);

                this.api.createServices();
                for (let i in this.registeredServices) {
                    this.terminal.api.log(`Service ${this.registeredServices[i].name} is registered\n`);
                    this.terminal.api.log(`Freezing service object for ${this.registeredServices[i].name}\n`);
                    Object.freeze(this.registeredServices[i]);
                }
                
                this.api.startTests();
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
                this.terminal.api.log(`Loading kernel ${this.kernel.name} (version ${this.kernel.version})\n\n`);
                this.kernel.api.init(this.terminal);
            }
        };
    }
}

const AuroraSystemKernel = new SystemKernel("Aurora", "0.1.0");
const AuroraSystemLoader = new SystemLoader(AuroraSystemKernel, "AuroraSysLoader", "0.1.0");
AuroraSystemLoader.api.boot();
