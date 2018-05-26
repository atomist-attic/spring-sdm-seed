import { Configuration, logger, FailurePromise } from "@atomist/automation-client";
import { GitProject } from "@atomist/automation-client/project/git/GitProject";
import * as clj from "@atomist/clj-editors";
import {
    branchFromCommit,
    DefaultDockerImageNameCreator,
    DockerBuildGoal,
    DockerOptions,
    executeDockerBuild,
    ExecuteGoalResult,
    executeVersioner,
    IsLein,
    leinBuilder,
    ProjectVersioner,
    RunWithLogContext,
    SoftwareDeliveryMachine,
    VersionGoal,
    editorAutofixRegistration,
} from "@atomist/sdm";
import * as build from "@atomist/sdm/blueprint/dsl/buildDsl";
import { IsNode } from "@atomist/sdm/common/listener/support/pushtest/node/nodePushTests";
import { spawnAndWatch } from "@atomist/sdm/util/misc/spawned";
import * as df from "dateformat";
import * as path from "path";

export function addLeinSupport(sdm: SoftwareDeliveryMachine,
                               configuration: Configuration) {

    // TODO cd atomist.sh builder
    sdm.addBuildRules(
        build.when(IsLein)
            .itMeans("Lein build")
            .set(leinBuilder(sdm.opts.projectLoader, "lein do clean, dynamodb-local test")),
    );

    sdm.addGoalImplementation("leinVersioner", VersionGoal,
            executeVersioner(sdm.opts.projectLoader, LeinProjectVersioner), { pushTest: IsLein })
        .addGoalImplementation("leinDockerBuild", DockerBuildGoal,
            executeDockerBuild(
                sdm.opts.projectLoader,
                DefaultDockerImageNameCreator,
                [MetajarPreparation],
                {
                    ...configuration.sdm.docker.jfrog as DockerOptions,
                    dockerfileFinder: async () => "docker/Dockerfile",
                }), { pushTest: IsLein })
        .addAutofixes(
            editorAutofixRegistration(
              {"name": "cljformat",
               "editor": async p => {
                    await clj.cljfmt(p.baseDir);
                    return p;
                },
              }));
    
}

export async function MetajarPreparation(p: GitProject, rwlc: RunWithLogContext): Promise<ExecuteGoalResult> {
    const result = await spawnAndWatch({
            command: "lein",
            args: ["with-profile", "metajar", "do", "clean,", "metajar"],
        },
        {
            cwd: p.baseDir,
        },
        rwlc.progressLog,
        {
            errorFinder: code => code !== 0,
        });
    return result;
}

export const LeinProjectVersioner: ProjectVersioner = async (status, p, log) => {
    const file = path.join(p.baseDir,"project.clj")
    const projectVersion = clj.getVersion(file);
    const branch = branchFromCommit(status.commit);
    const branchSuffix = branch !== status.commit.repo.defaultBranch ? `${branch}.` : "";
    const version = `${projectVersion}-${branchSuffix}${df(new Date(), "yyyymmddHHMMss")}`;

    await clj.setVersion(file,version);

    return version;
};

