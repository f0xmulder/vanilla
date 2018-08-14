/**
 * @author Adam Charron <adam.c@vanillaforums.com>
 * @copyright 2009-2018 Vanilla Forums Inc.
 * @license http://www.opensource.org/licenses/gpl-2.0.php GNU GPL v2
 */

import * as path from "path";
import { VANILLA_ROOT, TS_CONFIG_FILE, TS_LINT_FILE, PRETTIER_FILE } from "../env";
import { getAddonAliasMapping, getScriptSourceDirectories, lookupAddonPaths } from "../utility/addonUtils";
import PrettierPlugin from "prettier-webpack-plugin";
import HappyPack from "happypack";
import ForkTsCheckerWebpackPlugin from "fork-ts-checker-webpack-plugin";
import { getOptions } from "../options";
import chalk from "chalk";
import { print } from "util";
import { printVerbose } from "../utility/utils";

/**
 * Create the core webpack config.
 *
 * @param section - The section of the app to build. Eg. forum | admin | knowledge.
 */
export async function makeBaseConfig(section: string) {
    const happyThreadPool = HappyPack.ThreadPool({ size: 4, id: "ts" });
    const addonPaths = await lookupAddonPaths(section);
    const options = await getOptions();

    const modulePaths = [
        "node_modules",
        path.join(VANILLA_ROOT, "node_modules"),
        ...addonPaths.map(dir => path.resolve(dir, "node_modules")),
    ];
    const moduleAliases = await getAddonAliasMapping(section);

    const aliases = Object.keys(moduleAliases).join(", ");
    const message = `Building section ${chalk.yellowBright(section)} with the following aliases
${chalk.green(aliases)}`;
    printVerbose(message);

    const tsSourceIncludes = await getScriptSourceDirectories(section);

    const config = {
        context: VANILLA_ROOT,
        module: {
            rules: [
                {
                    test: /\.jsx?$/,
                    exclude: ["node_modules"],
                    include: [
                        // We need to transpile quill's ES6 because we are building from source.
                        /\/node_modules\/quill/,
                    ],
                    use: [
                        {
                            loader: "babel-loader",
                            options: {
                                presets: [require.resolve("@vanillaforums/babel-preset")],
                                cacheDirectory: true,
                            },
                        },
                    ],
                },
                {
                    test: /\.tsx?$/,
                    exclude: ["node_modules"],
                    include: tsSourceIncludes,
                    use: [
                        {
                            loader: "happypack/loader?id=ts",
                        },
                    ],
                },
                {
                    test: /\.html$/,
                    use: "raw-loader",
                },
                {
                    test: /\.svg$/,
                    use: [
                        {
                            loader: "html-loader",
                            options: {
                                minimize: true,
                            },
                        },
                    ],
                },
            ],
        },
        plugins: [
            new HappyPack({
                id: "ts",
                verbose: options.verbose,
                threadPool: happyThreadPool,
                loaders: [
                    {
                        loader: "babel-loader",
                        options: {
                            babelrc: false,
                            plugins: [
                                require.resolve("react-hot-loader/babel"),
                                require.resolve("babel-plugin-syntax-dynamic-import"),
                            ],
                        },
                    },
                    {
                        loader: "ts-loader",
                        options: {
                            happyPackMode: true,
                            configFile: TS_CONFIG_FILE,
                        },
                    },
                ],
            }),
            new ForkTsCheckerWebpackPlugin({
                tsconfig: TS_CONFIG_FILE,
                tslint: TS_LINT_FILE,
                checkSyntacticErrors: true,
                async: true,
            }),
        ],
        resolve: {
            modules: modulePaths,
            alias: moduleAliases,
            extensions: [".ts", ".tsx", ".js", ".jsx"],
            symlinks: false,
        },
        /**
         * We need to manually tell webpack where to resolve our loaders.
         * This is because process.cwd() probably won't contain the loaders we need
         * We are expecting thirs tool to be used in a different directory than itself.
         */
        resolveLoader: {
            modules: [path.join(VANILLA_ROOT, "node_modules")],
        },
    };

    if (options.fix) {
        config.plugins.unshift(getPrettierPlugin());
    }

    return config;
}

/**
 * Get a prettier plugin instance. This will autoformat source code as its built.
 */
function getPrettierPlugin() {
    const prettierConfig = require(PRETTIER_FILE);
    return new PrettierPlugin({
        ...prettierConfig,
        parser: "typescript",
        extensions: [".ts", ".tsx"],
    });
}