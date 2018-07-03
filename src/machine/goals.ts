/*
 * Copyright © 2018 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// GOAL Definition

import {
    ArtifactGoal,
    AutofixGoal,
    BuildGoal,
    FingerprintGoal,
    Goal,
    Goals,
    GoalWithPrecondition,
    IndependentOfEnvironment,
    LocalDeploymentGoal,
    ProductionEnvironment,
    PushReactionGoal,
    ReviewGoal,
    StagingEnvironment,
} from "@atomist/sdm";
import {
    DockerBuildGoal,
    TagGoal,
    VersionGoal,
} from "@atomist/sdm-core";
import {LocalDeploymentGoals} from "@atomist/sdm-core/pack/well-known-goals/httpServiceGoals";

// GOALSET Definition

// Just running review and autofix
export const CheckGoals = new Goals(
    "Check",
    VersionGoal,
    ReviewGoal,
    AutofixGoal,
    FingerprintGoal,
    PushReactionGoal,
);

// Just running the build
export const BuildGoals = new Goals(
    "Build",
    ...CheckGoals.goals,
    BuildGoal,
    ArtifactGoal,
);

export const BuildWithLocalDeploymentGoals = new Goals(
    "Build",
    ...CheckGoals.goals,
    BuildGoal,
    ArtifactGoal,
    new GoalWithPrecondition(LocalDeploymentGoal.definition, ArtifactGoal),
);
