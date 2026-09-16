require('fs').writeFileSync(process.argv[2], 'node '+process.versions.node+' | electron '+process.versions.electron+' | '+process.arch);
