if (process.versions.node !== '24.21.0') {
  process.stderr.write('This release requires Node 24.21.0. Refusing runtime drift.\n');
  process.exitCode = 1;
}
