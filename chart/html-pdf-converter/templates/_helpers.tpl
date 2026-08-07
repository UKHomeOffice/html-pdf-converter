{{/*
Expand the name of the chart.
*/}}
{{- define "html-pdf-converter.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}


{{/*
Branch-aware workload name for ephemeral and stable environments.
*/}}
{{- define "html-pdf-converter.workloadName" -}}
{{- $workload := default (dict) .Values.workload -}}
{{- $base := default "html-pdf-converter" (get $workload "baseName") -}}
{{- $branch := default "" (get $workload "branchName") -}}
{{- $branchScoped := default false (get $workload "branchScoped") -}}
{{- if and $branchScoped $branch -}}
{{- printf "%s-%s" $base $branch | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $base -}}
{{- end -}}
{{- end }}


{{/*
Deployment name.
*/}}
{{- define "html-pdf-converter.deploymentName" -}}
{{ include "html-pdf-converter.workloadName" . }}
{{- end }}


{{/*
Replica count using environment defaults.
*/}}
{{- define "html-pdf-converter.replicaCount" -}}
{{- $workload := default (dict) .Values.workload -}}
{{- $replicas := default (dict) (get $workload "replicas") -}}
{{- $env := lower (default "" (get $workload "environment")) -}}
{{- $fallback := default 1 .Values.replicaCount -}}
{{- $prodReplicas := default $fallback (get $replicas "prod") -}}
{{- $defaultReplicas := default $fallback (get $replicas "default") -}}
{{- if eq $env "prod" -}}
{{ $prodReplicas }}
{{- else -}}
{{ $defaultReplicas }}
{{- end -}}
{{- end }}


{{/*
Selectors/labels aligned with deployed workload name.
*/}}
{{- define "html-pdf-converter.selectorLabels" -}}
name: {{ include "html-pdf-converter.workloadName" . }}
service: {{ include "html-pdf-converter.workloadName" . }}
{{- end }}


{{/*
Service labels.
*/}}
{{- define "html-pdf-converter.serviceLabels" -}}
name: {{ include "html-pdf-converter.workloadName" . }}
role: service
{{- end }}


{{/*
Service selectors.
*/}}
{{- define "html-pdf-converter.serviceSelector" -}}
name: {{ include "html-pdf-converter.workloadName" . }}
{{- end }}


{{/*
Create a fully qualified app name.
*/}}
{{- define "html-pdf-converter.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name (include "html-pdf-converter.name" .) | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}


{{/*
Common labels.
*/}}
{{- define "html-pdf-converter.labels" -}}
helm.sh/chart: {{ include "html-pdf-converter.chart" . }}
app.kubernetes.io/name: {{ include "html-pdf-converter.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}


{{/*
Platform mandatory labels for Kyverno policies.
*/}}
{{- define "html-pdf-converter.platformMandatoryLabels" -}}
{{- $platformLabels := default (dict) .Values.platformLabels -}}
{{- $sourceRepoRaw := default "https://github.com/UKHomeOffice/html-pdf-converter" (get $platformLabels "sourceRepo") -}}
{{- $sourceRepoLabel := $sourceRepoRaw | lower | replace "https://" "" | replace "http://" "" | replace "/" "-" | replace ":" "-" | replace " " "-" | trimAll "-" | trunc 63 -}}
cost-centre: {{ default "unset" (get $platformLabels "costCentre") | quote }}
account-code: {{ default "unset" (get $platformLabels "accountCode") | quote }}
portfolio-id: {{ default "unset" (get $platformLabels "portfolioId") | quote }}
project-id: {{ default "unset" (get $platformLabels "projectId") | quote }}
service-id: {{ default "unset" (get $platformLabels "serviceId") | quote }}
owner-business: {{ default "unset" (get $platformLabels "ownerBusiness") | quote }}
budget-holder: {{ default "unset" (get $platformLabels "budgetHolder") | quote }}
environment-type: {{ default "unset" (get $platformLabels "environmentType") | quote }}
source-repo: {{ default "unset" $sourceRepoLabel | quote }}
{{- end }}


{{/*
Chart label.
*/}}
{{- define "html-pdf-converter.chart" -}}
{{ .Chart.Name }}-{{ .Chart.Version }}
{{- end }}