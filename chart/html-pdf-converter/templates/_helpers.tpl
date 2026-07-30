{{/*
Expand the name of the chart.
*/}}
{{- define "html-pdf-converter.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
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
cost-centre: {{ default "unset" .Values.platformLabels.costCentre | quote }}
account-code: {{ default "unset" .Values.platformLabels.accountCode | quote }}
portfolio-id: {{ default "unset" .Values.platformLabels.portfolioId | quote }}
project-id: {{ default "unset" .Values.platformLabels.projectId | quote }}
service-id: {{ default "unset" .Values.platformLabels.serviceId | quote }}
owner-business: {{ default "unset" .Values.platformLabels.ownerBusiness | quote }}
budget-holder: {{ default "unset" .Values.platformLabels.budgetHolder | quote }}
environment-type: {{ default "unset" .Values.platformLabels.environmentType | quote }}
source-repo: {{ default "https://github.com/UKHomeOffice/html-pdf-converter" .Values.platformLabels.sourceRepo | quote }}
{{- end }}


{{/*
Chart label.
*/}}
{{- define "html-pdf-converter.chart" -}}
{{ .Chart.Name }}-{{ .Chart.Version }}
{{- end }}