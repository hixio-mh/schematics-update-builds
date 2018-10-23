"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const rxjs_1 = require("rxjs");
const operators_1 = require("rxjs/operators");
const url = require("url");
const RegistryClient = require('npm-registry-client');
const npmPackageJsonCache = new Map();
const npmConfigOptionCache = new Map();
function _readNpmRc() {
    return new rxjs_1.Observable(subject => {
        // TODO: have a way to read options without using fs directly.
        const path = require('path');
        const fs = require('fs');
        const perProjectNpmrc = path.resolve('.npmrc');
        let npmrc = '';
        if (fs.existsSync(perProjectNpmrc)) {
            npmrc = fs.readFileSync(perProjectNpmrc).toString('utf-8');
        }
        else {
            if (process.platform === 'win32') {
                if (process.env.LOCALAPPDATA) {
                    npmrc = fs.readFileSync(path.join(process.env.LOCALAPPDATA, '.npmrc')).toString('utf-8');
                }
            }
            else {
                if (process.env.HOME) {
                    npmrc = fs.readFileSync(path.join(process.env.HOME, '.npmrc')).toString('utf-8');
                }
            }
        }
        const allOptionsArr = npmrc.split(/\r?\n/).map(x => x.trim());
        const allOptions = {};
        allOptionsArr.forEach(x => {
            const [key, ...value] = x.split('=');
            allOptions[key.trim()] = value.join('=').trim();
        });
        subject.next(allOptions);
        subject.complete();
    }).pipe(operators_1.catchError(() => rxjs_1.of({})), operators_1.shareReplay());
}
function getOptionFromNpmRc(option) {
    return _readNpmRc().pipe(operators_1.map(options => options[option]));
}
function getOptionFromNpmCli(option) {
    return new rxjs_1.Observable(subject => {
        child_process_1.exec(`npm get ${option}`, (error, data) => {
            if (error) {
                throw error;
            }
            else {
                data = data.trim();
                if (!data || data === 'undefined' || data === 'null') {
                    subject.next();
                }
                else {
                    subject.next(data);
                }
            }
            subject.complete();
        });
    }).pipe(operators_1.catchError(() => rxjs_1.of(undefined)), operators_1.shareReplay());
}
function getNpmConfigOption(option, scope, tryWithoutScope) {
    if (scope && tryWithoutScope) {
        return rxjs_1.concat(getNpmConfigOption(option, scope), getNpmConfigOption(option)).pipe(operators_1.filter(result => !!result), operators_1.defaultIfEmpty(), operators_1.first());
    }
    const fullOption = `${scope ? scope + ':' : ''}${option}`;
    let value = npmConfigOptionCache.get(fullOption);
    if (value) {
        return value;
    }
    value = option.startsWith('_')
        ? getOptionFromNpmRc(fullOption)
        : getOptionFromNpmCli(fullOption);
    npmConfigOptionCache.set(fullOption, value);
    return value;
}
function getNpmClientSslOptions(strictSsl, cafile) {
    const sslOptions = {};
    if (strictSsl === 'false') {
        sslOptions.strict = false;
    }
    else if (strictSsl === 'true') {
        sslOptions.strict = true;
    }
    if (cafile) {
        sslOptions.ca = fs_1.readFileSync(cafile);
    }
    return sslOptions;
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
    const scope = packageName.startsWith('@') ? packageName.split('/')[0] : undefined;
    return (registryUrl ? rxjs_1.of(registryUrl) : getNpmConfigOption('registry', scope, true)).pipe(operators_1.map(partialUrl => {
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
        return fullUrl;
    }), operators_1.concatMap(fullUrl => {
        let maybeRequest = npmPackageJsonCache.get(fullUrl.toString());
        if (maybeRequest) {
            return maybeRequest;
        }
        const registryKey = `//${fullUrl.host}/`;
        return rxjs_1.concat(getNpmConfigOption('proxy'), getNpmConfigOption('https-proxy'), getNpmConfigOption('strict-ssl'), getNpmConfigOption('cafile'), getNpmConfigOption('_auth'), getNpmConfigOption('user-agent'), getNpmConfigOption('_authToken', registryKey), getNpmConfigOption('username', registryKey, true), getNpmConfigOption('password', registryKey, true), getNpmConfigOption('email', registryKey, true), getNpmConfigOption('always-auth', registryKey, true)).pipe(operators_1.toArray(), operators_1.concatMap(options => {
            const [http, https, strictSsl, cafile, token, userAgent, authToken, username, password, email, alwaysAuth,] = options;
            const subject = new rxjs_1.ReplaySubject(1);
            const sslOptions = getNpmClientSslOptions(strictSsl, cafile);
            const auth = {};
            if (alwaysAuth !== undefined) {
                auth.alwaysAuth = alwaysAuth === 'false' ? false : !!alwaysAuth;
            }
            if (email) {
                auth.email = email;
            }
            if (authToken) {
                auth.token = authToken;
            }
            else if (token) {
                try {
                    // attempt to parse "username:password" from base64 token
                    // to enable Artifactory / Nexus-like repositories support
                    const delimiter = ':';
                    const parsedToken = Buffer.from(token, 'base64').toString('ascii');
                    const [extractedUsername, ...passwordArr] = parsedToken.split(delimiter);
                    const extractedPassword = passwordArr.join(delimiter);
                    if (extractedUsername && extractedPassword) {
                        auth.username = extractedUsername;
                        auth.password = extractedPassword;
                    }
                    else {
                        throw new Error('Unable to extract username and password from _auth token');
                    }
                }
                catch (ex) {
                    auth.token = token;
                }
            }
            else if (username) {
                auth.username = username;
                auth.password = password;
            }
            const client = new RegistryClient(Object.assign({ proxy: { http, https }, ssl: sslOptions }, (userAgent && { userAgent: userAgent })));
            client.log.level = 'silent';
            const params = {
                timeout: 30000,
                auth,
            };
            client.get(fullUrl.toString(), params, (error, data) => {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibnBtLmpzIiwic291cmNlUm9vdCI6Ii4vIiwic291cmNlcyI6WyJwYWNrYWdlcy9zY2hlbWF0aWNzL3VwZGF0ZS91cGRhdGUvbnBtLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBUUEsaURBQXFDO0FBQ3JDLDJCQUFrQztBQUNsQywrQkFBNkQ7QUFDN0QsOENBU3dCO0FBQ3hCLDJCQUEyQjtBQUczQixNQUFNLGNBQWMsR0FBRyxPQUFPLENBQUMscUJBQXFCLENBQUMsQ0FBQztBQUV0RCxNQUFNLG1CQUFtQixHQUFHLElBQUksR0FBRyxFQUFnRCxDQUFDO0FBQ3BGLE1BQU0sb0JBQW9CLEdBQUcsSUFBSSxHQUFHLEVBQTBDLENBQUM7QUFHL0UsU0FBUyxVQUFVO0lBQ2pCLE9BQU8sSUFBSSxpQkFBVSxDQUE0QixPQUFPLENBQUMsRUFBRTtRQUN6RCw4REFBOEQ7UUFDOUQsTUFBTSxJQUFJLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzdCLE1BQU0sRUFBRSxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN6QixNQUFNLGVBQWUsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBRS9DLElBQUksS0FBSyxHQUFHLEVBQUUsQ0FBQztRQUVmLElBQUksRUFBRSxDQUFDLFVBQVUsQ0FBQyxlQUFlLENBQUMsRUFBRTtZQUNsQyxLQUFLLEdBQUcsRUFBRSxDQUFDLFlBQVksQ0FBQyxlQUFlLENBQUMsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUM7U0FDNUQ7YUFBTTtZQUNMLElBQUksT0FBTyxDQUFDLFFBQVEsS0FBSyxPQUFPLEVBQUU7Z0JBQ2hDLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLEVBQUU7b0JBQzVCLEtBQUssR0FBRyxFQUFFLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQyxR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QUNuQixJQUFJLENBQUMsUUFBUSxHQUFHLFFBQVEsQ0FBQztnQkFDekIsSUFBSSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUM7YUFDMUI7WUFFRCxNQUFNLE1BQU0sR0FBRyxJQUFJLGNBQWMsaUJBQy9CLEtBQUssRUFBRSxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsRUFDdEIsR0FBRyxFQUFFLFVBQVUsSUFDWixDQUFDLFNBQVMsSUFBSSxFQUFDLFNBQVMsRUFBRSxTQUFTLEVBQUMsQ0FBQyxFQUN4QyxDQUFDO1lBQ0gsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEdBQUcsUUFBUSxDQUFDO1lBQzVCLE1BQU0sTUFBTSxHQUFHO2dCQUNiLE9BQU8sRUFBRSxLQUFLO2dCQUNkLElBQUk7YUFDTCxDQUFDO1lBRUYsTUFBTSxDQUFDLEdBQUcsQ0FDUixPQUFPLENBQUMsUUFBUSxFQUFFLEVBQ2xCLE1BQU0sRUFDTixDQUFDLEtBQWEsRUFBRSxJQUE4QixFQUFFLEVBQUU7Z0JBQ2xELElBQUksS0FBSyxFQUFFO29CQUNULE9BQU8sQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7aUJBQ3RCO2dCQUVELE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ25CLE9BQU8sQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNyQixDQUFDLENBQUMsQ0FBQztZQUVILFlBQVksR0FBRyxPQUFPLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDdEMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsRUFBRSxZQUFZLENBQUMsQ0FBQztZQUUxRCxPQUFPLFlBQVksQ0FBQztRQUN0QixDQUFDLENBQUMsQ0FDSCxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQ0gsQ0FBQztBQUVKLENBQUM7QUEvSUQsOENBK0lDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IEdvb2dsZSBJbmMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuaW1wb3J0IHsgbG9nZ2luZyB9IGZyb20gJ0Bhbmd1bGFyLWRldmtpdC9jb3JlJztcbmltcG9ydCB7IGV4ZWMgfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCB7IHJlYWRGaWxlU3luYyB9IGZyb20gJ2ZzJztcbmltcG9ydCB7IE9ic2VydmFibGUsIFJlcGxheVN1YmplY3QsIGNvbmNhdCwgb2YgfSBmcm9tICdyeGpzJztcbmltcG9ydCB7XG4gIGNhdGNoRXJyb3IsXG4gIGNvbmNhdE1hcCxcbiAgZGVmYXVsdElmRW1wdHksXG4gIGZpbHRlcixcbiAgZmlyc3QsXG4gIG1hcCxcbiAgc2hhcmVSZXBsYXksXG4gIHRvQXJyYXksXG59IGZyb20gJ3J4anMvb3BlcmF0b3JzJztcbmltcG9ydCAqIGFzIHVybCBmcm9tICd1cmwnO1xuaW1wb3J0IHsgTnBtUmVwb3NpdG9yeVBhY2thZ2VKc29uIH0gZnJvbSAnLi9ucG0tcGFja2FnZS1qc29uJztcblxuY29uc3QgUmVnaXN0cnlDbGllbnQgPSByZXF1aXJlKCducG0tcmVnaXN0cnktY2xpZW50Jyk7XG5cbmNvbnN0IG5wbVBhY2thZ2VKc29uQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgT2JzZXJ2YWJsZTxOcG1SZXBvc2l0b3J5UGFja2FnZUpzb24+PigpO1xuY29uc3QgbnBtQ29uZmlnT3B0aW9uQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgT2JzZXJ2YWJsZTxzdHJpbmcgfCB1bmRlZmluZWQ+PigpO1xuXG5cbmZ1bmN0aW9uIF9yZWFkTnBtUmMoKTogT2JzZXJ2YWJsZTx7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9PiB7XG4gIHJldHVybiBuZXcgT2JzZXJ2YWJsZTx7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9PihzdWJqZWN0ID0+IHtcbiAgICAvLyBUT0RPOiBoYXZlIGEgd2F5IHRvIHJlYWQgb3B0aW9ucyB3aXRob3V0IHVzaW5nIGZzIGRpcmVjdGx5LlxuICAgIGNvbnN0IHBhdGggPSByZXF1aXJlKCdwYXRoJyk7XG4gICAgY29uc3QgZnMgPSByZXF1aXJlKCdmcycpO1xuICAgIGNvbnN0IHBlclByb2plY3ROcG1yYyA9IHBhdGgucmVzb2x2ZSgnLm5wbXJjJyk7XG5cbiAgICBsZXQgbnBtcmMgPSAnJztcblxuICAgIGlmIChmcy5leGlzdHNTeW5jKHBlclByb2plY3ROcG1yYykpIHtcbiAgICAgIG5wbXJjID0gZnMucmVhZEZpbGVTeW5jKHBlclByb2plY3ROcG1yYykudG9TdHJpbmcoJ3V0Zi04Jyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChwcm9jZXNzLnBsYXRmb3JtID09PSAnd2luMzInKSB7XG4gICAgICAgIGlmIChwcm9jZXNzLmVudi5MT0NBTEFQUERBVEEpIHtcbiAgICAgICAgICBucG1yYyA9IGZzLnJlYWRGaWxlU3luYyhwYXRoLmpvaW4ocHJvY2Vzcy5lbnYuTE9DQUxBUFBEQVRBLCAnLm5wbXJjJykpLnRvU3RyaW5nKCd1dGYtOCcpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAocHJvY2Vzcy5lbnYuSE9NRSkge1xuICAgICAgICAgIG5wbXJjID0gZnMucmVhZEZpbGVTeW5jKHBhdGguam9pbihwcm9jZXNzLmVudi5IT01FLCAnLm5wbXJjJykpLnRvU3RyaW5nKCd1dGYtOCcpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgYWxsT3B0aW9uc0FyciA9IG5wbXJjLnNwbGl0KC9cXHI/XFxuLykubWFwKHggPT4geC50cmltKCkpO1xuICAgIGNvbnN0IGFsbE9wdGlvbnM6IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH0gPSB7fTtcblxuICAgIGFsbE9wdGlvbnNBcnIuZm9yRWFjaCh4ID0+IHtcbiAgICAgIGNvbnN0IFtrZXksIC4uLnZhbHVlXSA9IHguc3BsaXQoJz0nKTtcbiAgICAgIGFsbE9wdGlvbnNba2V5LnRyaW0oKV0gPSB2YWx1ZS5qb2luKCc9JykudHJpbSgpO1xuICAgIH0pO1xuXG4gICAgc3ViamVjdC5uZXh0KGFsbE9wdGlvbnMpO1xuICAgIHN1YmplY3QuY29tcGxldGUoKTtcbiAgfSkucGlwZShcbiAgICBjYXRjaEVycm9yKCgpID0+IG9mKHt9KSksXG4gICAgc2hhcmVSZXBsYXkoKSxcbiAgKTtcbn1cblxuXG5mdW5jdGlvbiBnZXRPcHRpb25Gcm9tTnBtUmMob3B0aW9uOiBzdHJpbmcpOiBPYnNlcnZhYmxlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuICByZXR1cm4gX3JlYWROcG1SYygpLnBpcGUoXG4gICAgbWFwKG9wdGlvbnMgPT4gb3B0aW9uc1tvcHRpb25dKSxcbiAgKTtcbn1cblxuZnVuY3Rpb24gZ2V0T3B0aW9uRnJvbU5wbUNsaShvcHRpb246IHN0cmluZyk6IE9ic2VydmFibGU8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG4gIHJldHVybiBuZXcgT2JzZXJ2YWJsZTxzdHJpbmcgfCB1bmRlZmluZWQ+KHN1YmplY3QgPT4ge1xuICAgIGV4ZWMoYG5wbSBnZXQgJHtvcHRpb259YCwgKGVycm9yLCBkYXRhKSA9PiB7XG4gICAgICBpZiAoZXJyb3IpIHtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkYXRhID0gZGF0YS50cmltKCk7XG4gICAgICAgIGlmICghZGF0YSB8fCBkYXRhID09PSAndW5kZWZpbmVkJyB8fCBkYXRhID09PSAnbnVsbCcpIHtcbiAgICAgICAgICBzdWJqZWN0Lm5leHQoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzdWJqZWN0Lm5leHQoZGF0YSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgc3ViamVjdC5jb21wbGV0ZSgpO1xuICAgIH0pO1xuICB9KS5waXBlKFxuICAgIGNhdGNoRXJyb3IoKCkgPT4gb2YodW5kZWZpbmVkKSksXG4gICAgc2hhcmVSZXBsYXkoKSxcbiAgKTtcbn1cblxuZnVuY3Rpb24gZ2V0TnBtQ29uZmlnT3B0aW9uKFxuICBvcHRpb246IHN0cmluZyxcbiAgc2NvcGU/OiBzdHJpbmcsXG4gIHRyeVdpdGhvdXRTY29wZT86IGJvb2xlYW4sXG4pOiBPYnNlcnZhYmxlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuICBpZiAoc2NvcGUgJiYgdHJ5V2l0aG91dFNjb3BlKSB7XG4gICAgcmV0dXJuIGNvbmNhdChcbiAgICAgIGdldE5wbUNvbmZpZ09wdGlvbihvcHRpb24sIHNjb3BlKSxcbiAgICAgIGdldE5wbUNvbmZpZ09wdGlvbihvcHRpb24pLFxuICAgICkucGlwZShcbiAgICAgIGZpbHRlcihyZXN1bHQgPT4gISFyZXN1bHQpLFxuICAgICAgZGVmYXVsdElmRW1wdHkoKSxcbiAgICAgIGZpcnN0KCksXG4gICAgKTtcbiAgfVxuXG4gIGNvbnN0IGZ1bGxPcHRpb24gPSBgJHtzY29wZSA/IHNjb3BlICsgJzonIDogJyd9JHtvcHRpb259YDtcblxuICBsZXQgdmFsdWUgPSBucG1Db25maWdPcHRpb25DYWNoZS5nZXQoZnVsbE9wdGlvbik7XG4gIGlmICh2YWx1ZSkge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuXG4gIHZhbHVlID0gb3B0aW9uLnN0YXJ0c1dpdGgoJ18nKVxuICAgICAgPyBnZXRPcHRpb25Gcm9tTnBtUmMoZnVsbE9wdGlvbilcbiAgICAgIDogZ2V0T3B0aW9uRnJvbU5wbUNsaShmdWxsT3B0aW9uKTtcblxuICBucG1Db25maWdPcHRpb25DYWNoZS5zZXQoZnVsbE9wdGlvbiwgdmFsdWUpO1xuXG4gIHJldHVybiB2YWx1ZTtcbn1cblxuZnVuY3Rpb24gZ2V0TnBtQ2xpZW50U3NsT3B0aW9ucyhzdHJpY3RTc2w/OiBzdHJpbmcsIGNhZmlsZT86IHN0cmluZykge1xuICBjb25zdCBzc2xPcHRpb25zOiB7IHN0cmljdD86IGJvb2xlYW4sIGNhPzogQnVmZmVyIH0gPSB7fTtcblxuICBpZiAoc3RyaWN0U3NsID09PSAnZmFsc2UnKSB7XG4gICAgc3NsT3B0aW9ucy5zdHJpY3QgPSBmYWxzZTtcbiAgfSBlbHNlIGlmIChzdHJpY3RTc2wgPT09ICd0cnVlJykge1xuICAgIHNzbE9wdGlvbnMuc3RyaWN0ID0gdHJ1ZTtcbiAgfVxuXG4gIGlmIChjYWZpbGUpIHtcbiAgICBzc2xPcHRpb25zLmNhID0gcmVhZEZpbGVTeW5jKGNhZmlsZSk7XG4gIH1cblxuICByZXR1cm4gc3NsT3B0aW9ucztcbn1cblxuLyoqXG4gKiBHZXQgdGhlIE5QTSByZXBvc2l0b3J5J3MgcGFja2FnZS5qc29uIGZvciBhIHBhY2thZ2UuIFRoaXMgaXMgcFxuICogQHBhcmFtIHtzdHJpbmd9IHBhY2thZ2VOYW1lIFRoZSBwYWNrYWdlIG5hbWUgdG8gZmV0Y2guXG4gKiBAcGFyYW0ge3N0cmluZ30gcmVnaXN0cnlVcmwgVGhlIE5QTSBSZWdpc3RyeSBVUkwgdG8gdXNlLlxuICogQHBhcmFtIHtMb2dnZXJBcGl9IGxvZ2dlciBBIGxvZ2dlciBpbnN0YW5jZSB0byBsb2cgZGVidWcgaW5mb3JtYXRpb24uXG4gKiBAcmV0dXJucyBBbiBvYnNlcnZhYmxlIHRoYXQgd2lsbCBwdXQgdGhlIHBhY2FrZ2UuanNvbiBjb250ZW50LlxuICogQHByaXZhdGVcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldE5wbVBhY2thZ2VKc29uKFxuICBwYWNrYWdlTmFtZTogc3RyaW5nLFxuICByZWdpc3RyeVVybDogc3RyaW5nIHwgdW5kZWZpbmVkLFxuICBsb2dnZXI6IGxvZ2dpbmcuTG9nZ2VyQXBpLFxuKTogT2JzZXJ2YWJsZTxQYXJ0aWFsPE5wbVJlcG9zaXRvcnlQYWNrYWdlSnNvbj4+IHtcbiAgY29uc3Qgc2NvcGUgPSBwYWNrYWdlTmFtZS5zdGFydHNXaXRoKCdAJykgPyBwYWNrYWdlTmFtZS5zcGxpdCgnLycpWzBdIDogdW5kZWZpbmVkO1xuXG4gIHJldHVybiAoXG4gICAgcmVnaXN0cnlVcmwgPyBvZihyZWdpc3RyeVVybCkgOiBnZXROcG1Db25maWdPcHRpb24oJ3JlZ2lzdHJ5Jywgc2NvcGUsIHRydWUpXG4gICkucGlwZShcbiAgICBtYXAocGFydGlhbFVybCA9PiB7XG4gICAgICBpZiAoIXBhcnRpYWxVcmwpIHtcbiAgICAgICAgcGFydGlhbFVybCA9ICdodHRwczovL3JlZ2lzdHJ5Lm5wbWpzLm9yZy8nO1xuICAgICAgfVxuICAgICAgY29uc3QgcGFydGlhbCA9IHVybC5wYXJzZShwYXJ0aWFsVXJsKTtcbiAgICAgIGxldCBmdWxsVXJsID0gbmV3IHVybC5VUkwoYGh0dHA6Ly8ke3BhcnRpYWwuaG9zdH0vJHtwYWNrYWdlTmFtZS5yZXBsYWNlKC9cXC8vZywgJyUyRicpfWApO1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVnaXN0cnkgPSBuZXcgdXJsLlVSTChwYXJ0aWFsVXJsKTtcbiAgICAgICAgcmVnaXN0cnkucGF0aG5hbWUgPSAocmVnaXN0cnkucGF0aG5hbWUgfHwgJycpXG4gICAgICAgICAgICAucmVwbGFjZSgvXFwvPyQvLCAnLycgKyBwYWNrYWdlTmFtZS5yZXBsYWNlKC9cXC8vZywgJyUyRicpKTtcbiAgICAgICAgZnVsbFVybCA9IG5ldyB1cmwuVVJMKHVybC5mb3JtYXQocmVnaXN0cnkpKTtcbiAgICAgIH0gY2F0Y2gge31cblxuICAgICAgbG9nZ2VyLmRlYnVnKFxuICAgICAgICBgR2V0dGluZyBwYWNrYWdlLmpzb24gZnJvbSAnJHtwYWNrYWdlTmFtZX0nICh1cmw6ICR7SlNPTi5zdHJpbmdpZnkoZnVsbFVybCl9KS4uLmAsXG4gICAgICApO1xuXG4gICAgICByZXR1cm4gZnVsbFVybDtcbiAgICB9KSxcbiAgICBjb25jYXRNYXAoZnVsbFVybCA9PiB7XG4gICAgICBsZXQgbWF5YmVSZXF1ZXN0ID0gbnBtUGFja2FnZUpzb25DYWNoZS5nZXQoZnVsbFVybC50b1N0cmluZygpKTtcbiAgICAgIGlmIChtYXliZVJlcXVlc3QpIHtcbiAgICAgICAgcmV0dXJuIG1heWJlUmVxdWVzdDtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVnaXN0cnlLZXkgPSBgLy8ke2Z1bGxVcmwuaG9zdH0vYDtcblxuICAgICAgcmV0dXJuIGNvbmNhdChcbiAgICAgICAgZ2V0TnBtQ29uZmlnT3B0aW9uKCdwcm94eScpLFxuICAgICAgICBnZXROcG1Db25maWdPcHRpb24oJ2h0dHBzLXByb3h5JyksXG4gICAgICAgIGdldE5wbUNvbmZpZ09wdGlvbignc3RyaWN0LXNzbCcpLFxuICAgICAgICBnZXROcG1Db25maWdPcHRpb24oJ2NhZmlsZScpLFxuICAgICAgICBnZXROcG1Db25maWdPcHRpb24oJ19hdXRoJyksXG4gICAgICAgIGdldE5wbUNvbmZpZ09wdGlvbigndXNlci1hZ2VudCcpLFxuICAgICAgICBnZXROcG1Db25maWdPcHRpb24oJ19hdXRoVG9rZW4nLCByZWdpc3RyeUtleSksXG4gICAgICAgIGdldE5wbUNvbmZpZ09wdGlvbigndXNlcm5hbWUnLCByZWdpc3RyeUtleSwgdHJ1ZSksXG4gICAgICAgIGdldE5wbUNvbmZpZ09wdGlvbigncGFzc3dvcmQnLCByZWdpc3RyeUtleSwgdHJ1ZSksXG4gICAgICAgIGdldE5wbUNvbmZpZ09wdGlvbignZW1haWwnLCByZWdpc3RyeUtleSwgdHJ1ZSksXG4gICAgICAgIGdldE5wbUNvbmZpZ09wdGlvbignYWx3YXlzLWF1dGgnLCByZWdpc3RyeUtleSwgdHJ1ZSksXG4gICAgICApLnBpcGUoXG4gICAgICAgIHRvQXJyYXkoKSxcbiAgICAgICAgY29uY2F0TWFwKG9wdGlvbnMgPT4ge1xuICAgICAgICAgIGNvbnN0IFtcbiAgICAgICAgICAgIGh0dHAsXG4gICAgICAgICAgICBodHRwcyxcbiAgICAgICAgICAgIHN0cmljdFNzbCxcbiAgICAgICAgICAgIGNhZmlsZSxcbiAgICAgICAgICAgIHRva2VuLFxuICAgICAgICAgICAgdXNlckFnZW50LFxuICAgICAgICAgICAgYXV0aFRva2VuLFxuICAgICAgICAgICAgdXNlcm5hbWUsXG4gICAgICAgICAgICBwYXNzd29yZCxcbiAgICAgICAgICAgIGVtYWlsLFxuICAgICAgICAgICAgYWx3YXlzQXV0aCxcbiAgICAgICAgICBdID0gb3B0aW9ucztcblxuICAgICAgICAgIGNvbnN0IHN1YmplY3QgPSBuZXcgUmVwbGF5U3ViamVjdDxOcG1SZXBvc2l0b3J5UGFja2FnZUpzb24+KDEpO1xuXG4gICAgICAgICAgY29uc3Qgc3NsT3B0aW9ucyA9IGdldE5wbUNsaWVudFNzbE9wdGlvbnMoc3RyaWN0U3NsLCBjYWZpbGUpO1xuXG4gICAgICAgICAgY29uc3QgYXV0aDoge1xuICAgICAgICAgICAgdG9rZW4/OiBzdHJpbmcsXG4gICAgICAgICAgICBhbHdheXNBdXRoPzogYm9vbGVhbjtcbiAgICAgICAgICAgIHVzZXJuYW1lPzogc3RyaW5nO1xuICAgICAgICAgICAgcGFzc3dvcmQ/OiBzdHJpbmc7XG4gICAgICAgICAgICBlbWFpbD86IHN0cmluZztcbiAgICAgICAgICB9ID0ge307XG5cbiAgICAgICAgICBpZiAoYWx3YXlzQXV0aCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBhdXRoLmFsd2F5c0F1dGggPSBhbHdheXNBdXRoID09PSAnZmFsc2UnID8gZmFsc2UgOiAhIWFsd2F5c0F1dGg7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKGVtYWlsKSB7XG4gICAgICAgICAgICBhdXRoLmVtYWlsID0gZW1haWw7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKGF1dGhUb2tlbikge1xuICAgICAgICAgICAgYXV0aC50b2tlbiA9IGF1dGhUb2tlbjtcbiAgICAgICAgICB9IGVsc2UgaWYgKHRva2VuKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAvLyBhdHRlbXB0IHRvIHBhcnNlIFwidXNlcm5hbWU6cGFzc3dvcmRcIiBmcm9tIGJhc2U2NCB0b2tlblxuICAgICAgICAgICAgICAvLyB0byBlbmFibGUgQXJ0aWZhY3RvcnkgLyBOZXh1cy1saWtlIHJlcG9zaXRvcmllcyBzdXBwb3J0XG4gICAgICAgICAgICAgIGNvbnN0IGRlbGltaXRlciA9ICc6JztcbiAgICAgICAgICAgICAgY29uc3QgcGFyc2VkVG9rZW4gPSBCdWZmZXIuZnJvbSh0b2tlbiwgJ2Jhc2U2NCcpLnRvU3RyaW5nKCdhc2NpaScpO1xuICAgICAgICAgICAgICBjb25zdCBbZXh0cmFjdGVkVXNlcm5hbWUsIC4uLnBhc3N3b3JkQXJyXSA9IHBhcnNlZFRva2VuLnNwbGl0KGRlbGltaXRlcik7XG4gICAgICAgICAgICAgIGNvbnN0IGV4dHJhY3RlZFBhc3N3b3JkID0gcGFzc3dvcmRBcnIuam9pbihkZWxpbWl0ZXIpO1xuXG4gICAgICAgICAgICAgIGlmIChleHRyYWN0ZWRVc2VybmFtZSAmJiBleHRyYWN0ZWRQYXNzd29yZCkge1xuICAgICAgICAgICAgICAgIGF1dGgudXNlcm5hbWUgPSBleHRyYWN0ZWRVc2VybmFtZTtcbiAgICAgICAgICAgICAgICBhdXRoLnBhc3N3b3JkID0gZXh0cmFjdGVkUGFzc3dvcmQ7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmFibGUgdG8gZXh0cmFjdCB1c2VybmFtZSBhbmQgcGFzc3dvcmQgZnJvbSBfYXV0aCB0b2tlbicpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGNhdGNoIChleCkge1xuICAgICAgICAgICAgICBhdXRoLnRva2VuID0gdG9rZW47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIGlmICh1c2VybmFtZSkge1xuICAgICAgICAgICAgYXV0aC51c2VybmFtZSA9IHVzZXJuYW1lO1xuICAgICAgICAgICAgYXV0aC5wYXNzd29yZCA9IHBhc3N3b3JkO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnN0IGNsaWVudCA9IG5ldyBSZWdpc3RyeUNsaWVudCh7XG4gICAgICAgICAgICBwcm94eTogeyBodHRwLCBodHRwcyB9LFxuICAgICAgICAgICAgc3NsOiBzc2xPcHRpb25zLFxuICAgICAgICAgICAgLi4uKHVzZXJBZ2VudCAmJiB7dXNlckFnZW50OiB1c2VyQWdlbnR9KSxcbiAgICAgICAgICB9KTtcbiAgICAgICAgICBjbGllbnQubG9nLmxldmVsID0gJ3NpbGVudCc7XG4gICAgICAgICAgY29uc3QgcGFyYW1zID0ge1xuICAgICAgICAgICAgdGltZW91dDogMzAwMDAsXG4gICAgICAgICAgICBhdXRoLFxuICAgICAgICAgIH07XG5cbiAgICAgICAgICBjbGllbnQuZ2V0KFxuICAgICAgICAgICAgZnVsbFVybC50b1N0cmluZygpLFxuICAgICAgICAgICAgcGFyYW1zLFxuICAgICAgICAgICAgKGVycm9yOiBvYmplY3QsIGRhdGE6IE5wbVJlcG9zaXRvcnlQYWNrYWdlSnNvbikgPT4ge1xuICAgICAgICAgICAgaWYgKGVycm9yKSB7XG4gICAgICAgICAgICAgIHN1YmplY3QuZXJyb3IoZXJyb3IpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBzdWJqZWN0Lm5leHQoZGF0YSk7XG4gICAgICAgICAgICBzdWJqZWN0LmNvbXBsZXRlKCk7XG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICBtYXliZVJlcXVlc3QgPSBzdWJqZWN0LmFzT2JzZXJ2YWJsZSgpO1xuICAgICAgICAgIG5wbVBhY2thZ2VKc29uQ2FjaGUuc2V0KGZ1bGxVcmwudG9TdHJpbmcoKSwgbWF5YmVSZXF1ZXN0KTtcblxuICAgICAgICAgIHJldHVybiBtYXliZVJlcXVlc3Q7XG4gICAgICAgIH0pLFxuICAgICAgKTtcbiAgICB9KSxcbiAgKTtcblxufVxuIl19