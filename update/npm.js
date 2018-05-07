"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const rxjs_1 = require("rxjs");
const operators_1 = require("rxjs/operators");
const url = require("url");
const RegistryClient = require('npm-registry-client');
const npmPackageJsonCache = new Map();
function getNpmConfigOption(option) {
    return new rxjs_1.Observable(obs => {
        try {
            child_process_1.exec(`npm get ${option}`, (error, data) => {
                if (error) {
                    obs.next();
                }
                else {
                    data = data.trim();
                    if (!data || data === 'undefined' || data === 'null') {
                        obs.next();
                    }
                    else {
                        obs.next(data);
                    }
                }
                obs.complete();
            });
        }
        catch (_a) {
            obs.next();
            obs.complete();
        }
    });
}
/**
 * Get the NPM repository's package.json for a package. This is p
 * @param {string} packageName The package name to fetch.
 * @param {string} registryUrl The NPM Registry URL to use.
 * @param {LoggerApi} logger A logger instance to log debug information.
 * @returns An observable that will put the pacakge.json content.
 * @private
 */
function getNpmPackageJson(packageName, registryUrl, logger) {
    const scope = packageName.startsWith('@') ? packageName.split('/')[0] : null;
    return rxjs_1.concat(rxjs_1.of(registryUrl), scope ? getNpmConfigOption(scope + ':registry') : rxjs_1.of(undefined), getNpmConfigOption('registry')).pipe(operators_1.filter(partialUrl => !!partialUrl), operators_1.first(), operators_1.map(partialUrl => {
        if (!partialUrl) {
            partialUrl = 'https://registry.npmjs.org/';
        }
        const partial = url.parse(partialUrl);
        let fullUrl = new url.URL(`http://${partial.host}/${packageName.replace(/\//g, '%2F')}`);
        try {
            const registry = new url.URL(partialUrl);
            registry.pathname = (registry.pathname || '')
                .replace(/\/?$/, '/' + packageName.replace(/\//g, '%2F'));
            fullUrl = new url.URL(url.format(registry));
        }
        catch (_a) { }
        logger.debug(`Getting package.json from '${packageName}' (url: ${JSON.stringify(fullUrl)})...`);
        return fullUrl.toString();
    }), operators_1.concatMap(fullUrl => {
        let maybeRequest = npmPackageJsonCache.get(fullUrl);
        if (maybeRequest) {
            return maybeRequest;
        }
        return rxjs_1.concat(getNpmConfigOption('proxy'), getNpmConfigOption('https-proxy')).pipe(operators_1.toArray(), operators_1.concatMap(options => {
            const subject = new rxjs_1.ReplaySubject(1);
            const client = new RegistryClient({
                proxy: {
                    http: options[0],
                    https: options[1],
                },
            });
            client.log.level = 'silent';
            const params = {
                timeout: 30000,
            };
            client.get(fullUrl, params, (error, data) => {
                if (error) {
                    subject.error(error);
                }
                subject.next(data);
                subject.complete();
            });
            maybeRequest = subject.asObservable();
            npmPackageJsonCache.set(fullUrl.toString(), maybeRequest);
            return maybeRequest;
        }));
    }));
}
exports.getNpmPackageJson = getNpmPackageJson;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibnBtLmpzIiwic291cmNlUm9vdCI6Ii4vIiwic291cmNlcyI6WyJwYWNrYWdlcy9zY2hlbWF0aWNzL3VwZGF0ZS91cGRhdGUvbnBtLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBUUEsaURBQXFDO0FBQ3JDLCtCQUE2RDtBQUM3RCw4Q0FBd0U7QUFDeEUsMkJBQTJCO0FBRzNCLE1BQU0sY0FBYyxHQUFHLE9BQU8sQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO0FBRXRELE1BQU0sbUJBQW1CLEdBQUcsSUFBSSxHQUFHLEVBQWdELENBQUM7QUFHcEYsNEJBQTRCLE1BQWM7SUFDeEMsTUFBTSxDQUFDLElBQUksaUJBQVUsQ0FBcUIsR0FBRyxDQUFDLEVBQUU7UUFDOUMsSUFBSSxDQUFDO1lBQ0gsb0JBQUksQ0FBQyxXQUFXLE1BQU0sRUFBRSxFQUFFLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxFQUFFO2dCQUN4QyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO29CQUNWLEdBQUcsQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDYixDQUFDO2dCQUFDLElBQUksQ0FBQyxDQUFDO29CQUNOLElBQUksR0FBRyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7b0JBQ25CLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFJLElBQUksS0FBSyxXQUFXLElBQUksSUFBSSxLQUFLLE1BQU0sQ0FBQyxDQUFDLENBQUM7d0JBQ3JELEdBQUcsQ0FBQyxJQUFJLEVBQUUsQ0FBQztvQkFDYixDQUFDO29CQUFDLElBQUksQ0FBQyxDQUFDO3dCQUNOLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7b0JBQ2pCLENBQUM7Z0JBQ0gsQ0FBQztnQkFFRCxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDakIsQ0FBQyxDQUFDLENBQUM7UUFDTCxDQUFDO1FBQUMsS0FBSyxDQUFDLENBQUMsSUFBRCxDQUFDO1lBQ1AsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFD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QkFDbEI7YUFDRixDQUFDLENBQUM7WUFDSCxNQUFNLENBQUMsR0FBRyxDQUFDLEtBQUssR0FBRyxRQUFRLENBQUM7WUFDNUIsTUFBTSxNQUFNLEdBQUc7Z0JBQ2IsT0FBTyxFQUFFLEtBQUs7YUFDZixDQUFDO1lBRUYsTUFBTSxDQUFDLEdBQUcsQ0FDUixPQUFPLEVBQ1AsTUFBTSxFQUNOLENBQUMsS0FBYSxFQUFFLElBQThCLEVBQUUsRUFBRTtnQkFDbEQsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztvQkFDVixPQUFPLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUN2QixDQUFDO2dCQUVELE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ25CLE9BQU8sQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNyQixDQUFDLENBQUMsQ0FBQztZQUVILFlBQVksR0FBRyxPQUFPLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDdEMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsRUFBRSxZQUFZLENBQUMsQ0FBQztZQUUxRCxNQUFNLENBQUMsWUFBWSxDQUFDO1FBQ3RCLENBQUMsQ0FBQyxDQUNILENBQUM7SUFDSixDQUFDLENBQUMsQ0FDSCxDQUFDO0FBRUosQ0FBQztBQS9FRCw4Q0ErRUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgR29vZ2xlIEluYy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5pbXBvcnQgeyBsb2dnaW5nIH0gZnJvbSAnQGFuZ3VsYXItZGV2a2l0L2NvcmUnO1xuaW1wb3J0IHsgZXhlYyB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuaW1wb3J0IHsgT2JzZXJ2YWJsZSwgUmVwbGF5U3ViamVjdCwgY29uY2F0LCBvZiB9IGZyb20gJ3J4anMnO1xuaW1wb3J0IHsgY29uY2F0TWFwLCBmaWx0ZXIsIGZpcnN0LCBtYXAsIHRvQXJyYXkgfSBmcm9tICdyeGpzL29wZXJhdG9ycyc7XG5pbXBvcnQgKiBhcyB1cmwgZnJvbSAndXJsJztcbmltcG9ydCB7IE5wbVJlcG9zaXRvcnlQYWNrYWdlSnNvbiB9IGZyb20gJy4vbnBtLXBhY2thZ2UtanNvbic7XG5cbmNvbnN0IFJlZ2lzdHJ5Q2xpZW50ID0gcmVxdWlyZSgnbnBtLXJlZ2lzdHJ5LWNsaWVudCcpO1xuXG5jb25zdCBucG1QYWNrYWdlSnNvbkNhY2hlID0gbmV3IE1hcDxzdHJpbmcsIE9ic2VydmFibGU8TnBtUmVwb3NpdG9yeVBhY2thZ2VKc29uPj4oKTtcblxuXG5mdW5jdGlvbiBnZXROcG1Db25maWdPcHRpb24ob3B0aW9uOiBzdHJpbmcpIHtcbiAgcmV0dXJuIG5ldyBPYnNlcnZhYmxlPHN0cmluZyB8IHVuZGVmaW5lZD4ob2JzID0+IHtcbiAgICB0cnkge1xuICAgICAgZXhlYyhgbnBtIGdldCAke29wdGlvbn1gLCAoZXJyb3IsIGRhdGEpID0+IHtcbiAgICAgICAgaWYgKGVycm9yKSB7XG4gICAgICAgICAgb2JzLm5leHQoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBkYXRhID0gZGF0YS50cmltKCk7XG4gICAgICAgICAgaWYgKCFkYXRhIHx8IGRhdGEgPT09ICd1bmRlZmluZWQnIHx8IGRhdGEgPT09ICdudWxsJykge1xuICAgICAgICAgICAgb2JzLm5leHQoKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgb2JzLm5leHQoZGF0YSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgb2JzLmNvbXBsZXRlKCk7XG4gICAgICB9KTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIG9icy5uZXh0KCk7XG4gICAgICBvYnMuY29tcGxldGUoKTtcbiAgICB9XG4gIH0pO1xufVxuXG4vKipcbiAqIEdldCB0aGUgTlBNIHJlcG9zaXRvcnkncyBwYWNrYWdlLmpzb24gZm9yIGEgcGFja2FnZS4gVGhpcyBpcyBwXG4gKiBAcGFyYW0ge3N0cmluZ30gcGFja2FnZU5hbWUgVGhlIHBhY2thZ2UgbmFtZSB0byBmZXRjaC5cbiAqIEBwYXJhbSB7c3RyaW5nfSByZWdpc3RyeVVybCBUaGUgTlBNIFJlZ2lzdHJ5IFVSTCB0byB1c2UuXG4gKiBAcGFyYW0ge0xvZ2dlckFwaX0gbG9nZ2VyIEEgbG9nZ2VyIGluc3RhbmNlIHRvIGxvZyBkZWJ1ZyBpbmZvcm1hdGlvbi5cbiAqIEByZXR1cm5zIEFuIG9ic2VydmFibGUgdGhhdCB3aWxsIHB1dCB0aGUgcGFjYWtnZS5qc29uIGNvbnRlbnQuXG4gKiBAcHJpdmF0ZVxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0TnBtUGFja2FnZUpzb24oXG4gIHBhY2thZ2VOYW1lOiBzdHJpbmcsXG4gIHJlZ2lzdHJ5VXJsOiBzdHJpbmcgfCB1bmRlZmluZWQsXG4gIGxvZ2dlcjogbG9nZ2luZy5Mb2dnZXJBcGksXG4pOiBPYnNlcnZhYmxlPFBhcnRpYWw8TnBtUmVwb3NpdG9yeVBhY2thZ2VKc29uPj4ge1xuICBjb25zdCBzY29wZSA9IHBhY2thZ2VOYW1lLnN0YXJ0c1dpdGgoJ0AnKSA/IHBhY2thZ2VOYW1lLnNwbGl0KCcvJylbMF0gOiBudWxsO1xuXG4gIHJldHVybiBjb25jYXQoXG4gICAgb2YocmVnaXN0cnlVcmwpLFxuICAgIHNjb3BlID8gZ2V0TnBtQ29uZmlnT3B0aW9uKHNjb3BlICsgJzpyZWdpc3RyeScpIDogb2YodW5kZWZpbmVkKSxcbiAgICBnZXROcG1Db25maWdPcHRpb24oJ3JlZ2lzdHJ5JyksXG4gICkucGlwZShcbiAgICBmaWx0ZXIocGFydGlhbFVybCA9PiAhIXBhcnRpYWxVcmwpLFxuICAgIGZpcnN0KCksXG4gICAgbWFwKHBhcnRpYWxVcmwgPT4ge1xuICAgICAgaWYgKCFwYXJ0aWFsVXJsKSB7XG4gICAgICAgIHBhcnRpYWxVcmwgPSAnaHR0cHM6Ly9yZWdpc3RyeS5ucG1qcy5vcmcvJztcbiAgICAgIH1cbiAgICAgIGNvbnN0IHBhcnRpYWwgPSB1cmwucGFyc2UocGFydGlhbFVybCk7XG4gICAgICBsZXQgZnVsbFVybCA9IG5ldyB1cmwuVVJMKGBodHRwOi8vJHtwYXJ0aWFsLmhvc3R9LyR7cGFja2FnZU5hbWUucmVwbGFjZSgvXFwvL2csICclMkYnKX1gKTtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IHVybC5VUkwocGFydGlhbFVybCk7XG4gICAgICAgIHJlZ2lzdHJ5LnBhdGhuYW1lID0gKHJlZ2lzdHJ5LnBhdGhuYW1lIHx8ICcnKVxuICAgICAgICAgICAgLnJlcGxhY2UoL1xcLz8kLywgJy8nICsgcGFja2FnZU5hbWUucmVwbGFjZSgvXFwvL2csICclMkYnKSk7XG4gICAgICAgIGZ1bGxVcmwgPSBuZXcgdXJsLlVSTCh1cmwuZm9ybWF0KHJlZ2lzdHJ5KSk7XG4gICAgICB9IGNhdGNoIHt9XG5cbiAgICAgIGxvZ2dlci5kZWJ1ZyhcbiAgICAgICAgYEdldHRpbmcgcGFja2FnZS5qc29uIGZyb20gJyR7cGFja2FnZU5hbWV9JyAodXJsOiAke0pTT04uc3RyaW5naWZ5KGZ1bGxVcmwpfSkuLi5gLFxuICAgICAgKTtcblxuICAgICAgcmV0dXJuIGZ1bGxVcmwudG9TdHJpbmcoKTtcbiAgICB9KSxcbiAgICBjb25jYXRNYXAoZnVsbFVybCA9PiB7XG4gICAgICBsZXQgbWF5YmVSZXF1ZXN0ID0gbnBtUGFja2FnZUpzb25DYWNoZS5nZXQoZnVsbFVybCk7XG4gICAgICBpZiAobWF5YmVSZXF1ZXN0KSB7XG4gICAgICAgIHJldHVybiBtYXliZVJlcXVlc3Q7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBjb25jYXQoXG4gICAgICAgIGdldE5wbUNvbmZpZ09wdGlvbigncHJveHknKSxcbiAgICAgICAgZ2V0TnBtQ29uZmlnT3B0aW9uKCdodHRwcy1wcm94eScpLFxuICAgICAgKS5waXBlKFxuICAgICAgICB0b0FycmF5KCksXG4gICAgICAgIGNvbmNhdE1hcChvcHRpb25zID0+IHtcbiAgICAgICAgICBjb25zdCBzdWJqZWN0ID0gbmV3IFJlcGxheVN1YmplY3Q8TnBtUmVwb3NpdG9yeVBhY2thZ2VKc29uPigxKTtcblxuICAgICAgICAgIGNvbnN0IGNsaWVudCA9IG5ldyBSZWdpc3RyeUNsaWVudCh7XG4gICAgICAgICAgICBwcm94eToge1xuICAgICAgICAgICAgICBodHRwOiBvcHRpb25zWzBdLFxuICAgICAgICAgICAgICBodHRwczogb3B0aW9uc1sxXSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgY2xpZW50LmxvZy5sZXZlbCA9ICdzaWxlbnQnO1xuICAgICAgICAgIGNvbnN0IHBhcmFtcyA9IHtcbiAgICAgICAgICAgIHRpbWVvdXQ6IDMwMDAwLFxuICAgICAgICAgIH07XG5cbiAgICAgICAgICBjbGllbnQuZ2V0KFxuICAgICAgICAgICAgZnVsbFVybCxcbiAgICAgICAgICAgIHBhcmFtcyxcbiAgICAgICAgICAgIChlcnJvcjogb2JqZWN0LCBkYXRhOiBOcG1SZXBvc2l0b3J5UGFja2FnZUpzb24pID0+IHtcbiAgICAgICAgICAgIGlmIChlcnJvcikge1xuICAgICAgICAgICAgICBzdWJqZWN0LmVycm9yKGVycm9yKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgc3ViamVjdC5uZXh0KGRhdGEpO1xuICAgICAgICAgICAgc3ViamVjdC5jb21wbGV0ZSgpO1xuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgbWF5YmVSZXF1ZXN0ID0gc3ViamVjdC5hc09ic2VydmFibGUoKTtcbiAgICAgICAgICBucG1QYWNrYWdlSnNvbkNhY2hlLnNldChmdWxsVXJsLnRvU3RyaW5nKCksIG1heWJlUmVxdWVzdCk7XG5cbiAgICAgICAgICByZXR1cm4gbWF5YmVSZXF1ZXN0O1xuICAgICAgICB9KSxcbiAgICAgICk7XG4gICAgfSksXG4gICk7XG5cbn1cbiJdfQ==