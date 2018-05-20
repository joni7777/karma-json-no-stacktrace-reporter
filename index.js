const os = require('os');
const path = require('path');
const fs = require('fs');
const pathIsAbsolute = require('path-is-absolute');

// concatenate test suite(s) and test description by default
function defaultNameFormatter(browser, result) {
	return result.suite.join(' ') + ' ' + result.description
}

const JsonReporter = function (baseReporterDecorator, config, logger, helper, formatError) {
	const log = logger.create('reporter.json');
	const reporterConfig = config.junitReporter || {};
	const pkgName = reporterConfig.suite || '';
	let outputDir = reporterConfig.outputDir;
	const outputFile = reporterConfig.outputFile;
	let useBrowserName = reporterConfig.useBrowserName;
	const nameFormatter = reporterConfig.nameFormatter || defaultNameFormatter;
	const classNameFormatter = reporterConfig.classNameFormatter;
	const properties = reporterConfig.properties;

	const suites = [];
	let pendingFileWritings = 0;
	let fileWritingFinished = function () {
	};
	const allMessages = [];

	if (outputDir == null) {
		outputDir = '.'
	}

	outputDir = helper.normalizeWinPath(path.resolve(config.basePath, outputDir)) + path.sep;

	if (typeof useBrowserName === 'undefined') {
		useBrowserName = true
	}

	baseReporterDecorator(this);

	this.adapters = [
		function (msg) {
			allMessages.push(msg)
		}
	];

	const initializeJSONForBrowser = function (browser) {
		const timestamp = (new Date()).toISOString().substr(0, 19);
		const suite = suites[browser.id] = {testSuite: {}};
		const testSuite = suite.testSuite;
		testSuite.name = browser.name;
		testSuite.package = pkgName;
		testSuite.timestamp = timestamp;
		testSuite.hostname = os.hostname();
		testSuite.testCases = [];

		// const suite = suites[browser.id] = builder.create('testsuite');
		// suite.att('name', browser.name)
		// 	.att('package', pkgName)
		// 	.att('timestamp', timestamp)
		// 	.att('id', 0)
		// 	.att('hostname', os.hostname());

		// const propertiesElement = suite.ele('properties');
		// propertiesElement.ele('property', {name: 'browser.fullName', value: browser.fullName});

		const testSuiteProperties = testSuite.properties = {'browser.fullName': browser.fullName};

		// add additional properties passed in through the config
		for (const property in properties) {
			if (properties.hasOwnProperty(property)) {
				testSuiteProperties[property] = properties[property];
				// propertiesElement.ele('property', {name: property, value: properties[property]})
			}
		}
	};

	const writeJSONForBrowser = function (browser) {
		let newOutputFile;
		const safeBrowserName = browser.name.replace(/ /g, '_');
		if (outputFile && pathIsAbsolute(outputFile)) {
			newOutputFile = outputFile
		} else if (outputFile != null) {
			const dir = useBrowserName ? path.join(outputDir, safeBrowserName)
				: outputDir;
			newOutputFile = path.join(dir, outputFile)
		} else if (useBrowserName) {
			newOutputFile = path.join(outputDir, 'TESTS-' + safeBrowserName + '.json')
		} else {
			newOutputFile = path.join(outputDir, 'TESTS.json')
		}

		const jsonToOutput = suites[browser.id];
		if (!jsonToOutput) {
			return // don't die if browser didn't start
		}

		pendingFileWritings++;
		helper.mkdirIfNotExists(path.dirname(newOutputFile), function () {
			fs.writeFile(newOutputFile, jsonToOutput.end({pretty: true}), function (err) {
				if (err) {
					log.warn('Cannot write JSON\n\t' + err.message)
				} else {
					log.debug('JSON results written to "%s".', newOutputFile)
				}

				if (!--pendingFileWritings) {
					fileWritingFinished()
				}
			})
		})
	};

	const getClassName = function (browser, result) {
		const browserName = browser.name.replace(/ /g, '_').replace(/\./g, '_') + '.';

		return (useBrowserName ? browserName : '') + (pkgName ? pkgName + '.' : '') + result.suite[0]
	};

	// "run_start" - a test run is beginning for all browsers
	this.onRunStart = function (browsers) {
		// TODO: remove once we don't care about Karma 0.10
		browsers.forEach(initializeJSONForBrowser)
	};

	// "browser_start" - a test run is beginning in _this_ browser
	this.onBrowserStart = function (browser) {
		initializeJSONForBrowser(browser)
	};

	// "browser_complete" - a test run has completed in _this_ browser
	this.onBrowserComplete = function (browser) {
		const suite = suites[browser.id];
		const result = browser.lastResult;
		if (!suite || !result) {
			return // don't die if browser didn't start
		}

		const testSuite = suite.testSuite;
		testSuite.tests = result.total ? result.total : 0;
		testSuite.errors = result.disconnected || result.error ? 1 : 0;
		testSuite.failures = result.failed ? result.failed : 0;
		testSuite.time = (result.netTime || 0) / 1000;
		testSuite.systemOut = allMessages.join() + '\n';
		testSuite.systemErr = allMessages.join() + '\n';


		// suite.att('tests', result.total ? result.total : 0);
		// suite.att('errors', result.disconnected || result.error ? 1 : 0);
		// suite.att('failures', result.failed ? result.failed : 0);
		// suite.att('time', (result.netTime || 0) / 1000);
		//
		// suite.ele('system-out').dat(allMessages.join() + '\n');
		// suite.ele('system-err');

		writeJSONForBrowser(browser);

		// Release memory held by the test suite.
		suites[browser.id] = null
	};

	// "run_complete" - a test run has completed on all browsers
	this.onRunComplete = function () {
		allMessages.length = 0
	};

	this.specSuccess = this.specSkipped = this.specFailure = function (browser, result) {
		const testSuite = suites[browser.id].testSuite;

		if (!testsuite) {
			return
		}
		const spec = {
			name: nameFormatter(browser, result),
			time: ((result.time || 0) / 1000),
			className: (typeof classNameFormatter === 'function' ? classNameFormatter : getClassName)(browser, result)
		};


		// const spec = testsuite.ele('testcase', {
		// 	name: nameFormatter(browser, result),
		// 	time: ((result.time || 0) / 1000),
		// 	classname: (typeof classNameFormatter === 'function' ? classNameFormatter : getClassName)(browser, result)
		// });

		if (result.skipped) {
			// spec.ele('skipped')
			spec.skipped = true;
		}

		if (!result.success) {
			spec.failures = [];

			result.log.forEach(function (err) {
				spec.failures.push({error: formatError(err)});
				// spec.ele('failure', {type: ''}, formatError(err))
			})
		}
		testSuite.testCases.push(spec);
	};

	// wait for writing all the xml files, before exiting
	this.onExit = function (done) {
		if (pendingFileWritings) {
			fileWritingFinished = done
		} else {
			done()
		}
	}
};

JsonReporter.$inject = ['baseReporterDecorator', 'config', 'logger', 'helper', 'formatError'];

// PUBLISH DI MODULE
module.exports = {
	'reporter:json': ['type', JsonReporter]
};
