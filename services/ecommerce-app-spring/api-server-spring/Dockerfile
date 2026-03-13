FROM maven:3.9.9-eclipse-temurin-17 AS build

WORKDIR /build

COPY pom.xml .
COPY src ./src

RUN mvn -B -DskipTests clean package

FROM eclipse-temurin:17-jre

WORKDIR /app

COPY --from=build /build/target/api-server-spring-1.0.0.jar /app/app.jar

RUN mkdir -p /app/data /app/uploads

EXPOSE 8080

CMD ["java", "-jar", "/app/app.jar"]
