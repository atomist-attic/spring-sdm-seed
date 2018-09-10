import { SuccessIsReturn0ErrorFinder } from "@atomist/automation-client/util/spawned";
import { PrepareForGoalExecution } from "@atomist/sdm";
import { spawnAndWatch } from "@atomist/sdm/api-helper/misc/spawned";

export const MavenPackage: PrepareForGoalExecution = async (p, r) => {
    const result = await spawnAndWatch({
            command: "mvn",
            args: ["package", "-DskipTests=true", `-Dartifact.name=${r.id.repo}`],
        }, {
            cwd: p.baseDir,
        },
        r.progressLog,
        {
            errorFinder: SuccessIsReturn0ErrorFinder,
        });
    return result;
};
