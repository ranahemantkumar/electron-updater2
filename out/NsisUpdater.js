"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.NsisUpdater = void 0;

function _builderUtilRuntime() {
  const data = require("builder-util-runtime");

  _builderUtilRuntime = function () {
    return data;
  };

  return data;
}

function _child_process() {
  const data = require("child_process");

  _child_process = function () {
    return data;
  };

  return data;
}

var path = _interopRequireWildcard(require("path"));

function _BaseUpdater() {
  const data = require("./BaseUpdater");

  _BaseUpdater = function () {
    return data;
  };

  return data;
}

function _FileWithEmbeddedBlockMapDifferentialDownloader() {
  const data = require("./differentialDownloader/FileWithEmbeddedBlockMapDifferentialDownloader");

  _FileWithEmbeddedBlockMapDifferentialDownloader = function () {
    return data;
  };

  return data;
}

function _GenericDifferentialDownloader() {
  const data = require("./differentialDownloader/GenericDifferentialDownloader");

  _GenericDifferentialDownloader = function () {
    return data;
  };

  return data;
}

function _main() {
  const data = require("./main");

  _main = function () {
    return data;
  };

  return data;
}

function _Provider() {
  const data = require("./providers/Provider");

  _Provider = function () {
    return data;
  };

  return data;
}

function _fsExtra() {
  const data = require("fs-extra");

  _fsExtra = function () {
    return data;
  };

  return data;
}

function _windowsExecutableCodeSignatureVerifier() {
  const data = require("./windowsExecutableCodeSignatureVerifier");

  _windowsExecutableCodeSignatureVerifier = function () {
    return data;
  };

  return data;
}

function _url() {
  const data = require("url");

  _url = function () {
    return data;
  };

  return data;
}

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

let pako = null;

class NsisUpdater extends _BaseUpdater().BaseUpdater {
  constructor(options, app) {
    super(options, app);
  }
  /*** @private */


  doDownloadUpdate(downloadUpdateOptions) {
    const provider = downloadUpdateOptions.updateInfoAndProvider.provider;
    const fileInfo = (0, _Provider().findFile)(provider.resolveFiles(downloadUpdateOptions.updateInfoAndProvider.info), "exe");
    return this.executeDownload({
      fileExtension: "exe",
      downloadUpdateOptions,
      fileInfo,
      task: async (destinationFile, downloadOptions, packageFile, removeTempDirIfAny) => {
        if (hasQuotes(destinationFile) || packageFile != null && hasQuotes(packageFile)) {
          throw (0, _builderUtilRuntime().newError)(`destinationFile or packageFile contains illegal chars`, "ERR_UPDATER_ILLEGAL_FILE_NAME");
        }

        const packageInfo = fileInfo.packageInfo;
        const isWebInstaller = packageInfo != null && packageFile != null;

        if (isWebInstaller || (await this.differentialDownloadInstaller(fileInfo, downloadUpdateOptions, destinationFile, provider))) {
          await this.httpExecutor.download(fileInfo.url, destinationFile, downloadOptions);
        }

        const signatureVerificationStatus = await this.verifySignature(destinationFile);

        if (signatureVerificationStatus != null) {
          await removeTempDirIfAny(); // noinspection ThrowInsideFinallyBlockJS

          throw (0, _builderUtilRuntime().newError)(`New version ${downloadUpdateOptions.updateInfoAndProvider.info.version} is not signed by the application owner: ${signatureVerificationStatus}`, "ERR_UPDATER_INVALID_SIGNATURE");
        }

        if (isWebInstaller) {
          if (await this.differentialDownloadWebPackage(packageInfo, packageFile, provider)) {
            try {
              await this.httpExecutor.download(new (_url().URL)(packageInfo.path), packageFile, {
                headers: downloadUpdateOptions.requestHeaders,
                cancellationToken: downloadUpdateOptions.cancellationToken,
                sha512: packageInfo.sha512
              });
            } catch (e) {
              try {
                await (0, _fsExtra().unlink)(packageFile);
              } catch (ignored) {// ignore
              }

              throw e;
            }
          }
        }
      }
    });
  } // $certificateInfo = (Get-AuthenticodeSignature 'xxx\yyy.exe'
  // | where {$_.Status.Equals([System.Management.Automation.SignatureStatus]::Valid) -and $_.SignerCertificate.Subject.Contains("CN=siemens.com")})
  // | Out-String ; if ($certificateInfo) { exit 0 } else { exit 1 }


  async verifySignature(tempUpdateFile) {
    let publisherName;

    try {
      publisherName = (await this.configOnDisk.value).publisherName;

      if (publisherName == null) {
        return null;
      }
    } catch (e) {
      if (e.code === "ENOENT") {
        // no app-update.yml
        return null;
      }

      throw e;
    }

    return await (0, _windowsExecutableCodeSignatureVerifier().verifySignature)(Array.isArray(publisherName) ? publisherName : [publisherName], tempUpdateFile, this._logger);
  }

  doInstall(options) {
    const args = ["--updated"];

    if (options.isSilent) {
      args.push("/S");
    }

    if (options.isForceRunAfter) {
      args.push("--force-run");
    }

    const packagePath = this.downloadedUpdateHelper == null ? null : this.downloadedUpdateHelper.packageFile;

    if (packagePath != null) {
      // only = form is supported
      args.push(`--package-file=${packagePath}`);
    }

    const callUsingElevation = () => {
      _spawn(path.join(process.resourcesPath, "elevate.exe"), [options.installerPath].concat(args)).catch(e => this.dispatchError(e));
    };

    if (options.isAdminRightsRequired) {
      this._logger.info("isAdminRightsRequired is set to true, run installer using elevate.exe");

      callUsingElevation();
      return true;
    }

    _spawn(options.installerPath, args).catch(e => {
      // https://github.com/electron-userland/electron-builder/issues/1129
      // Node 8 sends errors: https://nodejs.org/dist/latest-v8.x/docs/api/errors.html#errors_common_system_errors
      const errorCode = e.code;

      this._logger.info(`Cannot run installer: error code: ${errorCode}, error message: "${e.message}", will be executed again using elevate if EACCES"`);

      if (errorCode === "UNKNOWN" || errorCode === "EACCES") {
        callUsingElevation();
      } else {
        this.dispatchError(e);
      }
    });

    return true;
  }

  async differentialDownloadInstaller(fileInfo, downloadUpdateOptions, installerPath, provider) {
    try {
      if (this._testOnlyOptions != null && !this._testOnlyOptions.isUseDifferentialDownload) {
        return true;
      }

      const newBlockMapUrl = (0, _main().newUrlFromBase)(`${fileInfo.url.pathname}.blockmap`, fileInfo.url);
      const oldBlockMapUrl = (0, _main().newUrlFromBase)(`${fileInfo.url.pathname.replace(new RegExp(downloadUpdateOptions.updateInfoAndProvider.info.version, "g"), this.app.version)}.blockmap`, fileInfo.url);

      this._logger.info(`Download block maps (old: "${oldBlockMapUrl.href}", new: ${newBlockMapUrl.href})`);

      const downloadBlockMap = async url => {
        const data = await this.httpExecutor.downloadToBuffer(url, {
          headers: downloadUpdateOptions.requestHeaders,
          cancellationToken: downloadUpdateOptions.cancellationToken
        });

        if (data == null || data.length === 0) {
          throw new Error(`Blockmap "${url.href}" is empty`);
        }

        if (pako == null) {
          pako = require("pako");
        }

        try {
          return JSON.parse(pako.inflate(data, {
            to: "string"
          }));
        } catch (e) {
          throw new Error(`Cannot parse blockmap "${url.href}", error: ${e}, raw data: ${data}`);
        }
      };

      const blockMapDataList = await Promise.all([downloadBlockMap(oldBlockMapUrl), downloadBlockMap(newBlockMapUrl)]);
      await new (_GenericDifferentialDownloader().GenericDifferentialDownloader)(fileInfo.info, this.httpExecutor, {
        newUrl: fileInfo.url,
        oldFile: path.join(this.downloadedUpdateHelper.cacheDir, _builderUtilRuntime().CURRENT_APP_INSTALLER_FILE_NAME),
        logger: this._logger,
        newFile: installerPath,
        isUseMultipleRangeRequest: provider.isUseMultipleRangeRequest,
        requestHeaders: downloadUpdateOptions.requestHeaders
      }).download(blockMapDataList[0], blockMapDataList[1]);
      return false;
    } catch (e) {
      this._logger.error(`Cannot download differentially, fallback to full download: ${e.stack || e}`);

      if (this._testOnlyOptions != null) {
        // test mode
        throw e;
      }

      return true;
    }
  }

  async differentialDownloadWebPackage(packageInfo, packagePath, provider) {
    if (packageInfo.blockMapSize == null) {
      return true;
    }

    try {
      await new (_FileWithEmbeddedBlockMapDifferentialDownloader().FileWithEmbeddedBlockMapDifferentialDownloader)(packageInfo, this.httpExecutor, {
        newUrl: new (_url().URL)(packageInfo.path),
        oldFile: path.join(this.downloadedUpdateHelper.cacheDir, _builderUtilRuntime().CURRENT_APP_PACKAGE_FILE_NAME),
        logger: this._logger,
        newFile: packagePath,
        requestHeaders: this.requestHeaders,
        isUseMultipleRangeRequest: provider.isUseMultipleRangeRequest
      }).download();
    } catch (e) {
      this._logger.error(`Cannot download differentially, fallback to full download: ${e.stack || e}`); // during test (developer machine mac or linux) we must throw error


      return process.platform === "win32";
    }

    return false;
  }

}
/**
 * This handles both node 8 and node 10 way of emitting error when spawning a process
 *   - node 8: Throws the error
 *   - node 10: Emit the error(Need to listen with on)
 */


exports.NsisUpdater = NsisUpdater;

async function _spawn(exe, args) {
  return new Promise((resolve, reject) => {
    try {
      const process = (0, _child_process().spawn)(exe, args, {
        detached: true,
        stdio: "ignore"
      });
      process.on("error", error => {
        reject(error);
      });
      process.unref();

      if (process.pid !== undefined) {
        resolve(true);
      }
    } catch (error) {
      reject(error);
    }
  });
}

function hasQuotes(name) {
  return name.includes("'") || name.includes('"');
} 
// __ts-babel@6.0.4
//# sourceMappingURL=NsisUpdater.js.map