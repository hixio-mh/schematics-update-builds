"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const os_1 = require("os");
const path = require("path");
const rxjs_1 = require("rxjs");
const operators_1 = require("rxjs/operators");
const ini = require('ini');
const lockfile = require('@yarnpkg/lockfile');
const pacote = require('pacote');
const npmPackageJsonCache = new Map();
let npmrc;
function readOptions(logger, yarn = false, showPotentials = false) {
    const cwd = process.cwd();
    const baseFilename = yarn ? 'yarnrc' : 'npmrc';
    const dotFilename = '.' + baseFilename;
    let globalPrefix;
    if (process.env.PREFIX) {
        globalPrefix = process.env.PREFIX;
    }
    else {
        globalPrefix = path.dirname(process.execPath);
        if (process.platform !== 'win32') {
            globalPrefix = path.dirname(globalPrefix);
        }
    }
    const defaultConfigLocations = [
        path.join(globalPrefix, 'etc', baseFilename),
        path.join(os_1.homedir(), dotFilename),
    ];
    const projectConfigLocations = [
        path.join(cwd, dotFilename),
    ];
    const root = path.parse(cwd).root;
    for (let curDir = path.dirname(cwd); curDir && curDir !== root; curDir = path.dirname(curDir)) {
        projectConfigLocations.unshift(path.join(curDir, dotFilename));
    }
    if (showPotentials) {
        logger.info(`Locating potential ${baseFilename} files:`);
    }
    let options = {};
    for (const location of [...defaultConfigLocations, ...projectConfigLocations]) {
        if (fs_1.existsSync(location)) {
            if (showPotentials) {
                logger.info(`Trying '${location}'...found.`);
            }
            const data = fs_1.readFileSync(location, 'utf8');
            options = Object.assign({}, options, (yarn ? lockfile.parse(data) : ini.parse(data)));
            if (options.cafile) {
                const cafile = path.resolve(path.dirname(location), options.cafile);
                delete options.cafile;
                try {
                    options.ca = fs_1.readFileSync(cafile, 'utf8').replace(/\r?\n/, '\\n');
                }
                catch (_a) { }
            }
        }
        else if (showPotentials) {
            logger.info(`Trying '${location}'...not found.`);
        }
    }
    // Substitute any environment variable references
    for (const key in options) {
        options[key] = options[key].replace(/\$\{([^\}]+)\}/, (_, name) => process.env[name] || '');
    }
    return options;
}
/**
 * Get the NPM repository's package.json for a package. This is p
 * @param {string} packageName The package name to fetch.
 * @param {string} registryUrl The NPM Registry URL to use.
 * @param {LoggerApi} logger A logger instance to log debug information.
 * @returns An observable that will put the pacakge.json content.
 * @private
 */
function getNpmPackageJson(packageName, logger, options) {
    const cachedResponse = npmPackageJsonCache.get(packageName);
    if (cachedResponse) {
        return cachedResponse;
    }
    if (!npmrc) {
        try {
            npmrc = readOptions(logger, false, options && options.verbose);
        }
        catch (_a) { }
        if (options && options.usingYarn) {
            try {
                npmrc = Object.assign({}, npmrc, readOptions(logger, true, options && options.verbose));
            }
            catch (_b) { }
        }
    }
    const resultPromise = pacote.packument(packageName, Object.assign({ 'full-metadata': true }, npmrc, { registry: options && options.registryUrl }));
    const response = rxjs_1.from(resultPromise).pipe(operators_1.shareReplay());
    npmPackageJsonCache.set(packageName, response);
    return response;
}
exports.getNpmPackageJson = getNpmPackageJson;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibnBtLmpzIiwic291cmNlUm9vdCI6Ii4vIiwic291cmNlcyI6WyJwYWNrYWdlcy9zY2hlbWF0aWNzL3VwZGF0ZS91cGRhdGUvbnBtLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBUUEsMkJBQThDO0FBQzlDLDJCQUE2QjtBQUM3Qiw2QkFBNkI7QUFDN0IsK0JBQXdDO0FBQ3hDLDhDQUE2QztBQUc3QyxNQUFNLEdBQUcsR0FBRyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDM0IsTUFBTSxRQUFRLEdBQUcsT0FBTyxDQUFDLG1CQUFtQixDQUFDLENBQUM7QUFDOUMsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0FBRWpDLE1BQU0sbUJBQW1CLEdBQUcsSUFBSSxHQUFHLEVBQWdELENBQUM7QUFDcEYsSUFBSSxLQUFnQyxDQUFDO0FBR3JDLFNBQVMsV0FBVyxDQUNsQixNQUF5QixFQUN6QixJQUFJLEdBQUcsS0FBSyxFQUNaLGNBQWMsR0FBRyxLQUFLO0lBRXRCLE1BQU0sR0FBRyxHQUFHLE9BQU8sQ0FBQyxHQUFHLEVBQUUsQ0FBQztJQUMxQixNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDO0lBQy9DLE1BQU0sV0FBVyxHQUFHLEdBQUcsR0FBRyxZQUFZLENBQUM7SUFFdkMsSUFBSSxZQUFvQixDQUFDO0lBQ3pCLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxNQUFNLEVBQUU7UUFDdEIsWUFBWSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDO0tBQ25DO1NBQU07UUFDTCxZQUFZLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDOUMsSUFBSSxPQUFPLENBQUMsUUFBUSxLQUFLLE9BQU8sRUFBRTtZQUNoQyxZQUFZLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsQ0FBQztTQUMz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LGNBQWMsQ0FBQztLQUN2QjtJQUVELElBQUksQ0FBQyxLQUFLLEVBQUU7UUFDVixJQUFJO1lBQ0YsS0FBSyxHQUFHLFdBQVcsQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLE9BQU8sSUFBSSxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7U0FDaEU7UUFBQyxXQUFNLEdBQUc7UUFFWCxJQUFJLE9BQU8sSUFBSSxPQUFPLENBQUMsU0FBUyxFQUFFO1lBQ2hDLElBQUk7Z0JBQ0YsS0FBSyxxQkFBUSxLQUFLLEVBQUssV0FBVyxDQUFDLE1BQU0sRUFBRSxJQUFJLEVBQUUsT0FBTyxJQUFJLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBRSxDQUFDO2FBQ2hGO1lBQUMsV0FBTSxHQUFHO1NBQ1o7S0FDRjtJQUVELE1BQU0sYUFBYSxHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQ3BDLFdBQVcsa0JBRVQsZUFBZSxFQUFFLElBQUksSUFDbEIsS0FBSyxJQUNSLFFBQVEsRUFBRSxPQUFPLElBQUksT0FBTyxDQUFDLFdBQVcsSUFFM0MsQ0FBQztJQUVGLE1BQU0sUUFBUSxHQUFHLFdBQUksQ0FBMkIsYUFBYSxDQUFDLENBQUMsSUFBSSxDQUFDLHVCQUFXLEVBQUUsQ0FBQyxDQUFDO0lBQ25GLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxXQUFXLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFFL0MsT0FBTyxRQUFRLENBQUM7QUFDbEIsQ0FBQztBQXZDRCw4Q0F1Q0MiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgR29vZ2xlIEluYy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5pbXBvcnQgeyBsb2dnaW5nIH0gZnJvbSAnQGFuZ3VsYXItZGV2a2l0L2NvcmUnO1xuaW1wb3J0IHsgZXhpc3RzU3luYywgcmVhZEZpbGVTeW5jIH0gZnJvbSAnZnMnO1xuaW1wb3J0IHsgaG9tZWRpciB9IGZyb20gJ29zJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgeyBPYnNlcnZhYmxlLCBmcm9tIH0gZnJvbSAncnhqcyc7XG5pbXBvcnQgeyBzaGFyZVJlcGxheSB9IGZyb20gJ3J4anMvb3BlcmF0b3JzJztcbmltcG9ydCB7IE5wbVJlcG9zaXRvcnlQYWNrYWdlSnNvbiB9IGZyb20gJy4vbnBtLXBhY2thZ2UtanNvbic7XG5cbmNvbnN0IGluaSA9IHJlcXVpcmUoJ2luaScpO1xuY29uc3QgbG9ja2ZpbGUgPSByZXF1aXJlKCdAeWFybnBrZy9sb2NrZmlsZScpO1xuY29uc3QgcGFjb3RlID0gcmVxdWlyZSgncGFjb3RlJyk7XG5cbmNvbnN0IG5wbVBhY2thZ2VKc29uQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgT2JzZXJ2YWJsZTxOcG1SZXBvc2l0b3J5UGFja2FnZUpzb24+PigpO1xubGV0IG5wbXJjOiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9O1xuXG5cbmZ1bmN0aW9uIHJlYWRPcHRpb25zKFxuICBsb2dnZXI6IGxvZ2dpbmcuTG9nZ2VyQXBpLFxuICB5YXJuID0gZmFsc2UsXG4gIHNob3dQb3RlbnRpYWxzID0gZmFsc2UsXG4pOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+IHtcbiAgY29uc3QgY3dkID0gcHJvY2Vzcy5jd2QoKTtcbiAgY29uc3QgYmFzZUZpbGVuYW1lID0geWFybiA/ICd5YXJucmMnIDogJ25wbXJjJztcbiAgY29uc3QgZG90RmlsZW5hbWUgPSAnLicgKyBiYXNlRmlsZW5hbWU7XG5cbiAgbGV0IGdsb2JhbFByZWZpeDogc3RyaW5nO1xuICBpZiAocHJvY2Vzcy5lbnYuUFJFRklYKSB7XG4gICAgZ2xvYmFsUHJlZml4ID0gcHJvY2Vzcy5lbnYuUFJFRklYO1xuICB9IGVsc2Uge1xuICAgIGdsb2JhbFByZWZpeCA9IHBhdGguZGlybmFtZShwcm9jZXNzLmV4ZWNQYXRoKTtcbiAgICBpZiAocHJvY2Vzcy5wbGF0Zm9ybSAhPT0gJ3dpbjMyJykge1xuICAgICAgZ2xvYmFsUHJlZml4ID0gcGF0aC5kaXJuYW1lKGdsb2JhbFByZWZpeCk7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgZGVmYXVsdENvbmZpZ0xvY2F0aW9ucyA9IFtcbiAgICBwYXRoLmpvaW4oZ2xvYmFsUHJlZml4LCAnZXRjJywgYmFzZUZpbGVuYW1lKSxcbiAgICBwYXRoLmpvaW4oaG9tZWRpcigpLCBkb3RGaWxlbmFtZSksXG4gIF07XG5cbiAgY29uc3QgcHJvamVjdENvbmZpZ0xvY2F0aW9uczogc3RyaW5nW10gPSBbXG4gICAgcGF0aC5qb2luKGN3ZCwgZG90RmlsZW5hbWUpLFxuICBdO1xuICBjb25zdCByb290ID0gcGF0aC5wYXJzZShjd2QpLnJvb3Q7XG4gIGZvciAobGV0IGN1ckRpciA9IHBhdGguZGlybmFtZShjd2QpOyBjdXJEaXIgJiYgY3VyRGlyICE9PSByb290OyBjdXJEaXIgPSBwYXRoLmRpcm5hbWUoY3VyRGlyKSkge1xuICAgIHByb2plY3RDb25maWdMb2NhdGlvbnMudW5zaGlmdChwYXRoLmpvaW4oY3VyRGlyLCBkb3RGaWxlbmFtZSkpO1xuICB9XG5cbiAgaWYgKHNob3dQb3RlbnRpYWxzKSB7XG4gICAgbG9nZ2VyLmluZm8oYExvY2F0aW5nIHBvdGVudGlhbCAke2Jhc2VGaWxlbmFtZX0gZmlsZXM6YCk7XG4gIH1cblxuICBsZXQgb3B0aW9uczogeyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfSA9IHt9O1xuICBmb3IgKGNvbnN0IGxvY2F0aW9uIG9mIFsuLi5kZWZhdWx0Q29uZmlnTG9jYXRpb25zLCAuLi5wcm9qZWN0Q29uZmlnTG9jYXRpb25zXSkge1xuICAgIGlmIChleGlzdHNTeW5jKGxvY2F0aW9uKSkge1xuICAgICAgaWYgKHNob3dQb3RlbnRpYWxzKSB7XG4gICAgICAgIGxvZ2dlci5pbmZvKGBUcnlpbmcgJyR7bG9jYXRpb259Jy4uLmZvdW5kLmApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBkYXRhID0gcmVhZEZpbGVTeW5jKGxvY2F0aW9uLCAndXRmOCcpO1xuICAgICAgb3B0aW9ucyA9IHtcbiAgICAgICAgLi4ub3B0aW9ucyxcbiAgICAgICAgLi4uKHlhcm4gPyBsb2NrZmlsZS5wYXJzZShkYXRhKSA6IGluaS5wYXJzZShkYXRhKSksXG4gICAgICB9O1xuXG4gICAgICBpZiAob3B0aW9ucy5jYWZpbGUpIHtcbiAgICAgICAgY29uc3QgY2FmaWxlID0gcGF0aC5yZXNvbHZlKHBhdGguZGlybmFtZShsb2NhdGlvbiksIG9wdGlvbnMuY2FmaWxlKTtcbiAgICAgICAgZGVsZXRlIG9wdGlvbnMuY2FmaWxlO1xuICAgICAgICB0cnkge1xuICAgICAgICAgIG9wdGlvbnMuY2EgPSByZWFkRmlsZVN5bmMoY2FmaWxlLCAndXRmOCcpLnJlcGxhY2UoL1xccj9cXG4vLCAnXFxcXG4nKTtcbiAgICAgICAgfSBjYXRjaCB7IH1cbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHNob3dQb3RlbnRpYWxzKSB7XG4gICAgICBsb2dnZXIuaW5mbyhgVHJ5aW5nICcke2xvY2F0aW9ufScuLi5ub3QgZm91bmQuYCk7XG4gICAgfVxuICB9XG5cbiAgLy8gU3Vic3RpdHV0ZSBhbnkgZW52aXJvbm1lbnQgdmFyaWFibGUgcmVmZXJlbmNlc1xuICBmb3IgKGNvbnN0IGtleSBpbiBvcHRpb25zKSB7XG4gICAgb3B0aW9uc1trZXldID0gb3B0aW9uc1trZXldLnJlcGxhY2UoL1xcJFxceyhbXlxcfV0rKVxcfS8sIChfLCBuYW1lKSA9PiBwcm9jZXNzLmVudltuYW1lXSB8fCAnJyk7XG4gIH1cblxuICByZXR1cm4gb3B0aW9ucztcbn1cblxuLyoqXG4gKiBHZXQgdGhlIE5QTSByZXBvc2l0b3J5J3MgcGFja2FnZS5qc29uIGZvciBhIHBhY2thZ2UuIFRoaXMgaXMgcFxuICogQHBhcmFtIHtzdHJpbmd9IHBhY2thZ2VOYW1lIFRoZSBwYWNrYWdlIG5hbWUgdG8gZmV0Y2guXG4gKiBAcGFyYW0ge3N0cmluZ30gcmVnaXN0cnlVcmwgVGhlIE5QTSBSZWdpc3RyeSBVUkwgdG8gdXNlLlxuICogQHBhcmFtIHtMb2dnZXJBcGl9IGxvZ2dlciBBIGxvZ2dlciBpbnN0YW5jZSB0byBsb2cgZGVidWcgaW5mb3JtYXRpb24uXG4gKiBAcmV0dXJucyBBbiBvYnNlcnZhYmxlIHRoYXQgd2lsbCBwdXQgdGhlIHBhY2FrZ2UuanNvbiBjb250ZW50LlxuICogQHByaXZhdGVcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldE5wbVBhY2thZ2VKc29uKFxuICBwYWNrYWdlTmFtZTogc3RyaW5nLFxuICBsb2dnZXI6IGxvZ2dpbmcuTG9nZ2VyQXBpLFxuICBvcHRpb25zPzoge1xuICAgIHJlZ2lzdHJ5VXJsPzogc3RyaW5nO1xuICAgIHVzaW5nWWFybj86IGJvb2xlYW47XG4gICAgdmVyYm9zZT86IGJvb2xlYW47XG4gIH0sXG4pOiBPYnNlcnZhYmxlPFBhcnRpYWw8TnBtUmVwb3NpdG9yeVBhY2thZ2VKc29uPj4ge1xuICBjb25zdCBjYWNoZWRSZXNwb25zZSA9IG5wbVBhY2thZ2VKc29uQ2FjaGUuZ2V0KHBhY2thZ2VOYW1lKTtcbiAgaWYgKGNhY2hlZFJlc3BvbnNlKSB7XG4gICAgcmV0dXJuIGNhY2hlZFJlc3BvbnNlO1xuICB9XG5cbiAgaWYgKCFucG1yYykge1xuICAgIHRyeSB7XG4gICAgICBucG1yYyA9IHJlYWRPcHRpb25zKGxvZ2dlciwgZmFsc2UsIG9wdGlvbnMgJiYgb3B0aW9ucy52ZXJib3NlKTtcbiAgICB9IGNhdGNoIHsgfVxuXG4gICAgaWYgKG9wdGlvbnMgJiYgb3B0aW9ucy51c2luZ1lhcm4pIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIG5wbXJjID0geyAuLi5ucG1yYywgLi4ucmVhZE9wdGlvbnMobG9nZ2VyLCB0cnVlLCBvcHRpb25zICYmIG9wdGlvbnMudmVyYm9zZSkgfTtcbiAgICAgIH0gY2F0Y2ggeyB9XG4gICAgfVxuICB9XG5cbiAgY29uc3QgcmVzdWx0UHJvbWlzZSA9IHBhY290ZS5wYWNrdW1lbnQoXG4gICAgcGFja2FnZU5hbWUsXG4gICAge1xuICAgICAgJ2Z1bGwtbWV0YWRhdGEnOiB0cnVlLFxuICAgICAgLi4ubnBtcmMsXG4gICAgICByZWdpc3RyeTogb3B0aW9ucyAmJiBvcHRpb25zLnJlZ2lzdHJ5VXJsLFxuICAgIH0sXG4gICk7XG5cbiAgY29uc3QgcmVzcG9uc2UgPSBmcm9tPE5wbVJlcG9zaXRvcnlQYWNrYWdlSnNvbj4ocmVzdWx0UHJvbWlzZSkucGlwZShzaGFyZVJlcGxheSgpKTtcbiAgbnBtUGFja2FnZUpzb25DYWNoZS5zZXQocGFja2FnZU5hbWUsIHJlc3BvbnNlKTtcblxuICByZXR1cm4gcmVzcG9uc2U7XG59XG4iXX0=