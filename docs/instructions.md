## Spring Boot from zero to kube in minutes

#### Install Minikube

Follow instructions at [https://kubernetes.io/docs/tasks/tools/install-minikube/](https://kubernetes.io/docs/tasks/tools/install-minikube/).

For Mac OS X users I recommend to install via Homebrew.

#### Create Minikube cluster

After installation run the following command to create a new local cluster:

```
$ minikube start
```

#### Configure up Docker environment in terminal session

This has to be executed in the terminal you are going to run the SDM in.

```
$ eval $(minikube docker-env)
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
$ kubectl get pods --all-namespace
```

#### Hit the app endpoint

To enable visiting the app endpoint on your minikube, you have to map `sdm.info`
to your minikube ip. 

For that, edit /etc/hosts and add:

```
[minikube ip] sdm.info
```

Where [minikube ip] is the output of running `minikube ip` on your terminal.

Now the `http://sdm.info/<owner>/<repo>` URLs will work.
