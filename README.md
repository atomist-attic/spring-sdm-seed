# @atomist/spring-sdm-seed

[![npm version](https://badge.fury.io/js/%40atomist%2Fspring-sdm-seed.svg)](https://badge.fury.io/js/%40atomist%2Fspring-sdm-seed)

An [Atomist][atomist] software delivery machine (SDM) automating the
creation, building, and delivery of [Spring][spring] and [Spring
Boot][spring-boot] applications.

[spring]: https://spring.io/ (Spring)
[spring-boot]: http://spring.io/projects/spring-boot (Spring Boot)

See the [Atomist documentation][atomist-doc] for more information on
what SDMs are and what they can do for you using the Atomist API for
software.

[atomist-doc]: https://docs.atomist.com/ (Atomist Documentation)

## Prerequisites

Before you can run this project, you will need an Atomist workspace.
See the [Atomist Getting Started Guide][atomist-start] for
instructions on how to get an Atomist workspace and connect it to your
source code repositories, continuous integration, chat platform, etc.

You will also need several other prerequisites to successfully run
this project.  See the [Atomist Developer Guide][atomist-dev] for
instructions on setting up your development environment.  Briefly, you
will need [Git][git], [Node.js][node], and the [Atomist
CLI][atomist-cli] installed and properly configured on your system.

[atomist-start]: https://docs.atomist.com/user/ (Atomist - Getting Started)
[atomist-dev]: https://docs.atomist.com/developer/prerequisites/ (Atomist - Developer Prerequisites)
[git]: https://git-scm.com/ (Git)
[atomist-cli]: https://github.com/atomist/cli (Atomist Command-Line Interface)

For this specific SDM, you will also need [Java][java] and
[Maven][mvn] installed.

[java]: http://openjdk.java.net/install/ (Java - Install)
[mvn]: https://maven.apache.org/download.cgi (Maven - Install)

## Running

Once the prerequisites are met on your system, use `npm` to install
dependencies and build the project.

```
$ npm install
$ npm run build
```

You can start up your SDM in the usual `npm` way.

```
$ npm start
```

The [Atomist API Client documentation][atomist-client] has more
complete instructions for running an SDM or other Atomist API client.

[atomist-client]: https://docs.atomist.com/developer/client/ (Atomist - API Client)

## Support

General support questions should be discussed in the `#support`
channel in the [Atomist community Slack workspace][slack].

If you find a problem, please create an [issue][].

[issue]: https://github.com/atomist/spring-sdm-seed/issues

## Development

You will need to install [node][] to build and test this project.

[node]: https://nodejs.org/ (Node.js)

### Build and test

Use the following package scripts to build, test, and perform other
development tasks.

Command | Reason
------- | ------
`npm install` | install project dependencies
`npm run build` | compile, test, lint, and generate docs
`npm start` | start the SDM
`npm run autostart` | run the SDM, refreshing when files change
`npm run lint` | run TSLint against the TypeScript
`npm run compile` | generate types from GraphQL and compile TypeScript
`npm test` | run tests
`npm run autotest` | run tests every time a file changes
`npm run clean` | remove files generated during build

### Release

Releases are handled via the [Atomist SDM][atomist-sdm].  Just press
the release button in the Atomist dashboard or Slack.

[atomist-sdm]: https://github.com/atomist/atomist-sdm (Atomist Software Delivery Machine)

---

Created by [Atomist][atomist].
Need Help?  [Join our Slack workspace][slack].

[atomist]: https://atomist.com/ (Atomist - How Teams Deliver Software)
[slack]: https://join.atomist.com/ (Atomist Community Slack)
