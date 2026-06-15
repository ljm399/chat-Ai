import os from "os";

/**
 * 获取当前系统用户主目录的绝对路径。
 *
 * @returns {string} 当前系统用户主目录绝对路径。
 */
export function getUserHomeDir() {
  return os.homedir();
}

/**
 * 获取当前 Node.js 进程启动时的工作目录绝对路径。
 *
 * @returns {string} 当前工作目录绝对路径。
 */
export function getCurrentWorkingDir() {
  return process.cwd();
}
