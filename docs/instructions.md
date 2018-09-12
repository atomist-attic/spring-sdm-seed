## Spring Boot from zero to kube in minutes

#### Install Minikube

Follow instructions at [https://kubernetes.io/docs/tasks/tools/install-minikube/](https://kubernetes.io/docs/tasks/tools/install-minikube/).

For Mac OS X users I recommend to install via Homebrew.

#### Create Minikube cluster

After installation run the following command to create a new local cluster:

```
$ minikube start
```

#### Install Atomist CLI

```
$ npm install -g @atomist/cli@branch-master
```

**Note**: please make sure to install `branch-master` of the CLI. 

#### Create Spring SDM

```
$ atomist create sdm
```

Select __spring with k8__.

#### Start SDM

```
$ cd <new SDM dir>
$ atomist start --local
```

#### Start the feed in a separate terminal

```
$ atomist feed
or
$ atomist feed --goals
```

#### Create new Spring Project

```
$ atomist create spring
```

#### Verify deployment

```
$ kubectl get pods --all-namespaces
```

#### Hit the app endpoint

The app endpoint will be available at: `http://<owner>.<repo>.<minikube ip>.nip.io`.

Where `minikube ip` is the IP outputted by running:

```
$ minikube ip
```
